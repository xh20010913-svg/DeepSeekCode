export interface DialogRequest {
  title: string;
  body: string;
}

export function formatDialog(request: DialogRequest): string {
  return `${request.title}\n${request.body}`;
}
