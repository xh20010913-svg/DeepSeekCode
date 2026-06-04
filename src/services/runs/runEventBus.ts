export interface RunEventBusEvent {
  runId: string | null;
  projectPath?: string;
  kind: string;
  payload: unknown;
  createdAtMs: number;
}

export interface RunEventBusSubscription {
  unsubscribe(): void;
}

export interface RunEventBusFilter {
  projectPath?: string;
  runId?: string;
}

type Listener = (event: RunEventBusEvent) => void;

class RunEventBus {
  private readonly listeners = new Set<{ filter: RunEventBusFilter; listener: Listener }>();

  publish(event: RunEventBusEvent): void {
    for (const entry of this.listeners) {
      if (entry.filter.runId && entry.filter.runId !== event.runId) continue;
      if (entry.filter.projectPath && event.projectPath && normalize(entry.filter.projectPath) !== normalize(event.projectPath)) continue;
      try {
        entry.listener(event);
      } catch {
        // Event subscribers must never disrupt the persisted run log.
      }
    }
  }

  subscribe(filter: RunEventBusFilter, listener: Listener): RunEventBusSubscription {
    const entry = { filter, listener };
    this.listeners.add(entry);
    return {
      unsubscribe: () => {
        this.listeners.delete(entry);
      },
    };
  }
}

const singleton = new RunEventBus();

export function getRunEventBus(): RunEventBus {
  return singleton;
}

function normalize(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}
