export interface ProactiveSuggestion {
  title: string;
  reason: string;
}

export function suggestNextSteps(): ProactiveSuggestion[] {
  return [];
}
