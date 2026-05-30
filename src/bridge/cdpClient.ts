export interface BrowserSnapshot {
  url: string;
  title: string;
  text: string;
}

interface CdpTarget {
  webSocketDebuggerUrl?: string;
  url?: string;
}

interface CdpWebSocket {
  addEventListener(type: "open" | "message" | "error" | "close", listener: (event: unknown) => void): void;
  send(data: string): void;
  close(): void;
}

type CdpWebSocketConstructor = new (url: string) => CdpWebSocket;

export function configuredCdpUrl(): string {
  const url = process.env.DEEPSEEKCODE_BROWSER_CDP_URL?.trim();
  if (!url) {
    throw new Error("DEEPSEEKCODE_BROWSER_CDP_URL is not configured. Start Chrome with --remote-debugging-port=9222 first.");
  }
  return url.replace(/\/+$/, "");
}

export async function captureBrowserSnapshot(url: string, cdpUrl = configuredCdpUrl()): Promise<BrowserSnapshot> {
  const client = await CdpSession.open(cdpUrl, url);
  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await waitForLoad(client);
    const title = await client.evaluate("document.title || ''");
    const text = await client.evaluate("document.body ? document.body.innerText.slice(0, 12000) : ''");
    const currentUrl = await client.evaluate("location.href");
    return {
      url: String(currentUrl),
      title: String(title),
      text: String(text),
    };
  } finally {
    client.close();
  }
}

export async function captureBrowserScreenshot(
  url: string,
  fullPage: boolean,
  cdpUrl = configuredCdpUrl(),
): Promise<Buffer> {
  const client = await CdpSession.open(cdpUrl, url);
  try {
    await client.send("Page.enable");
    await waitForLoad(client);
    if (fullPage) {
      const metrics = await client.send("Page.getLayoutMetrics");
      const contentSize = metrics?.contentSize as { width?: number; height?: number } | undefined;
      if (contentSize?.width && contentSize.height) {
        await client.send("Emulation.setDeviceMetricsOverride", {
          mobile: false,
          width: Math.ceil(contentSize.width),
          height: Math.ceil(contentSize.height),
          deviceScaleFactor: 1,
        });
      }
    }
    const result = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: fullPage,
      fromSurface: true,
    });
    return Buffer.from(String(result?.data ?? ""), "base64");
  } finally {
    client.close();
  }
}

export async function clickBrowserSelector(url: string, selector: string, cdpUrl = configuredCdpUrl()): Promise<string> {
  const client = await CdpSession.open(cdpUrl, url);
  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await waitForLoad(client);
    const result = await client.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return "missing";
        el.scrollIntoView({block: "center", inline: "center"});
        el.click();
        return "clicked";
      })()
    `);
    return String(result);
  } finally {
    client.close();
  }
}

export async function typeBrowserSelector(
  url: string,
  selector: string,
  text: string,
  cdpUrl = configuredCdpUrl(),
): Promise<string> {
  const client = await CdpSession.open(cdpUrl, url);
  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await waitForLoad(client);
    const result = await client.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return "missing";
        el.focus();
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return "typed";
      })()
    `);
    return String(result);
  } finally {
    client.close();
  }
}

async function waitForLoad(client: CdpSession): Promise<void> {
  await client.send("Page.navigate", undefined, true).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

class CdpSession {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

  private constructor(private readonly socket: CdpWebSocket) {
    socket.addEventListener("message", (event) => this.onMessage(event));
    socket.addEventListener("error", (event) => this.failAll(new Error(`CDP WebSocket error: ${String(event)}`)));
    socket.addEventListener("close", () => this.failAll(new Error("CDP WebSocket closed")));
  }

  static async open(cdpUrl: string, url: string): Promise<CdpSession> {
    const target = await createTarget(cdpUrl, url);
    if (!target.webSocketDebuggerUrl) throw new Error("Chrome target has no WebSocket debugger URL");
    const WebSocketCtor = (globalThis as unknown as { WebSocket?: CdpWebSocketConstructor }).WebSocket;
    if (!WebSocketCtor) throw new Error("This Node.js runtime does not expose a global WebSocket client");
    const socket = new WebSocketCtor(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", (event) => reject(new Error(`CDP WebSocket open failed: ${String(event)}`)));
    });
    return new CdpSession(socket);
  }

  async evaluate(expression: string): Promise<unknown> {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return (result?.result as { value?: unknown } | undefined)?.value;
  }

  send(method: string, params?: unknown, noThrow = false): Promise<Record<string, unknown> | undefined> {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve(value) {
          resolve(value as Record<string, unknown> | undefined);
        },
        reject(error) {
          if (noThrow) resolve(undefined);
          else reject(error);
        },
      });
    });
  }

  close(): void {
    this.socket.close();
  }

  private onMessage(event: unknown): void {
    const data = event && typeof event === "object" && "data" in event
      ? String((event as { data: unknown }).data)
      : String(event);
    const message = JSON.parse(data) as { id?: number; result?: unknown; error?: { message?: string } };
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message ?? "CDP command failed"));
    else pending.resolve(message.result);
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

async function createTarget(cdpUrl: string, url: string): Promise<CdpTarget> {
  const endpoint = `${cdpUrl}/json/new?${encodeURIComponent(url)}`;
  let response = await fetch(endpoint, { method: "PUT" });
  if (!response.ok && response.status === 405) response = await fetch(endpoint);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chrome CDP target create failed: ${response.status} ${text.slice(0, 300)}`);
  }
  return await response.json() as CdpTarget;
}
