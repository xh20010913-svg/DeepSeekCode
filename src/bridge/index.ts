export interface BridgeCapability {
  name: string;
  enabled: boolean;
  description: string;
}

export function listBridgeCapabilities(): BridgeCapability[] {
  return [
    {
      name: "browser",
      enabled: Boolean(process.env.DEEPSEEKCODE_BROWSER_CDP_URL),
      description: "Browser session bridge supports declared sessions plus CDP snapshot/screenshot/click/type when DEEPSEEKCODE_BROWSER_CDP_URL is configured.",
    },
    {
      name: "computer",
      enabled: false,
      description: "Computer-use bridge is reserved until explicit permissions and trajectory logging are implemented.",
    },
  ];
}
