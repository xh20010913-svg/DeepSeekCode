export interface VoiceModeStatus {
  enabled: boolean;
  reason: string;
}

export function voiceModeStatus(): VoiceModeStatus {
  return {
    enabled: false,
    reason: "Voice mode is not wired in DeepSeekCode yet.",
  };
}
