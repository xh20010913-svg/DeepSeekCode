import type { RuntimeConfig } from "../bootstrap/config.js";
import type { DeepSeekProviderClient } from "../protocol/provider.js";
import { QueryEngine, type QueryEvent } from "../query/QueryEngine.js";
import type { StateStore } from "../state/sqlite.js";

export async function collectHeadlessEvents(input: {
  prompt: string;
  config: RuntimeConfig;
  state: StateStore;
  provider: DeepSeekProviderClient | null;
}): Promise<QueryEvent[]> {
  const engine = new QueryEngine(input);
  const events: QueryEvent[] = [];
  for await (const event of engine.submit(input.prompt)) events.push(event);
  return events;
}
