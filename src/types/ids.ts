export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type RunId = Brand<string, "RunId">;
export type TaskId = Brand<string, "TaskId">;
export type ActionId = Brand<string, "ActionId">;
export type ArtifactId = Brand<string, "ArtifactId">;
export type SessionId = Brand<string, "SessionId">;

export function asRunId(value: string): RunId {
  return value as RunId;
}

export function asTaskId(value: string): TaskId {
  return value as TaskId;
}

export function asSessionId(value: string): SessionId {
  return value as SessionId;
}
