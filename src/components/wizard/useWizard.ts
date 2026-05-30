import type { WizardStep } from "./types.js";

export function useWizard(steps: readonly WizardStep[], activeId?: string): { activeIndex: number; activeStep: WizardStep | null } {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeId));
  return { activeIndex, activeStep: steps[activeIndex] ?? null };
}
