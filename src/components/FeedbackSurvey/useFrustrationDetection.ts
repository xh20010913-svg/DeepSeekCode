export function useFrustrationDetection(messages: readonly string[]): boolean {
  return messages.some((message) => /bug|卡死|删除不了|frustrat/i.test(message));
}
