import { bootstrapConfig } from "./bootstrap/config.js";
import { runSetupChecks } from "./setup.js";

const config = bootstrapConfig({});
for (const check of runSetupChecks(config)) {
  process.stdout.write(`${check.ok ? "ok" : "warn"} ${check.name}: ${check.detail}\n`);
}
