export interface UpstreamProxyConfig {
  enabled: boolean;
  baseUrl?: string;
}

export function upstreamProxyDisabled(): UpstreamProxyConfig {
  return { enabled: false };
}
