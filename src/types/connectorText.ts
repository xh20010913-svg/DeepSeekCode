export interface ConnectorText {
  title: string;
  body: string;
  source?: string;
}

export function connectorText(title: string, body: string, source?: string): ConnectorText {
  return { title, body, source };
}
