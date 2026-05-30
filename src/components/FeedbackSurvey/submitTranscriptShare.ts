export function submitTranscriptShare(): { ok: boolean; reason: string } {
  return { ok: false, reason: "transcript sharing is disabled locally" };
}
