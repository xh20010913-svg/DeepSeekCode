export interface IdeDiffConfig {
  enabled: boolean;
  command?: string;
}

export function ideDiffConfig(enabled: boolean, command?: string): IdeDiffConfig {
  return { enabled, command };
}
