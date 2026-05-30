export function createAbortController(): AbortController {
  return new AbortController();
}

export function abortWithReason(controller: AbortController, reason: string): void {
  controller.abort(new Error(reason));
}
