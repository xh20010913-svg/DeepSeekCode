import React from "react";
import { render } from "ink";
import type { RuntimeConfig } from "./bootstrap/config.js";
import { Workbench } from "./components/Workbench.js";
import type { DeepSeekProviderClient } from "./protocol/provider.js";
import type { StateStore } from "./state/sqlite.js";

export function launchRepl(input: {
  config: RuntimeConfig;
  state: StateStore;
  provider: DeepSeekProviderClient | null;
}): ReturnType<typeof render> {
  return render(<Workbench config={input.config} state={input.state} provider={input.provider} />);
}
