export function feedbackScoreLabel(score: number): string {
  return `${Math.max(0, Math.min(5, Math.round(score)))}/5`;
}
