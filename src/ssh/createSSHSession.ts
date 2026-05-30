export interface SSHSession {
  id: string;
  host: string;
  status: "planned" | "connected" | "closed";
}

export function createSSHSession(host: string): SSHSession {
  return {
    id: `ssh_${Buffer.from(host).toString("hex").slice(0, 16)}`,
    host,
    status: "planned",
  };
}
