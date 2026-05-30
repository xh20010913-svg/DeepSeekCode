import type { SshProfile } from "./sshProfileService.js";
import {
  runSshCommand,
  summarizeSshCommand,
  type SshCommandOutput,
  type SshExecutionPolicy,
} from "./sshRemoteExecutor.js";

export interface SshHealthResult {
  status: "ok" | "failed";
  profileName: string;
  target: string;
  message: string;
  output: SshCommandOutput;
}

export async function checkSshHealth(
  profile: SshProfile,
  policy: SshExecutionPolicy,
): Promise<SshHealthResult> {
  const output = await runSshCommand(profile, "printf deepseekcode-ssh-ok", {
    ...policy,
    timeoutMs: Math.min(policy.timeoutMs ?? 10_000, 30_000),
    maxOutputChars: Math.min(policy.maxOutputChars ?? 4_000, 8_000),
  });
  const ok = output.exitCode === 0 && !output.timedOut;
  return {
    status: ok ? "ok" : "failed",
    profileName: profile.name,
    target: output.target,
    message: summarizeSshCommand(output),
    output,
  };
}
