export function nullRenderingAttachments<T>(attachments: readonly T[] | undefined): T[] {
  return [...(attachments ?? [])];
}
