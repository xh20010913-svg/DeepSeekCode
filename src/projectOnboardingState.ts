export interface ProjectOnboardingState {
  completed: boolean;
  completedAtMs?: number;
}

const state: ProjectOnboardingState = {
  completed: false,
};

export function maybeMarkProjectOnboardingComplete(): ProjectOnboardingState {
  if (!state.completed) {
    state.completed = true;
    state.completedAtMs = Date.now();
  }
  return { ...state };
}
