import { createSSHSession, type SSHSession } from "./createSSHSession.js";

export class SSHSessionManager {
  private readonly sessions = new Map<string, SSHSession>();

  create(host: string): SSHSession {
    const session = createSSHSession(host);
    this.sessions.set(session.id, session);
    return session;
  }

  list(): SSHSession[] {
    return [...this.sessions.values()];
  }

  close(id: string): void {
    const session = this.sessions.get(id);
    if (session) session.status = "closed";
  }
}
