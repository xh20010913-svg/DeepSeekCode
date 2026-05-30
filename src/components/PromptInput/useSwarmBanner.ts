export function useSwarmBanner(agentCount: number): string {
  return agentCount > 1 ? `${agentCount} agents available` : "";
}
