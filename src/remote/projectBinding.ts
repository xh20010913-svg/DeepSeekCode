import path from "node:path";
import type { StateStore } from "../state/sqlite.js";

const SCOPE = "remote:project-binding";

export interface ProjectBindingConfig {
  defaultProjectPath: string;
  allowedRoots: string[];
}

export class RemoteProjectBinding {
  constructor(
    private readonly state: StateStore,
    private readonly config: ProjectBindingConfig,
  ) {}

  current(chatId: string): string {
    const stored = this.state.getUiState<string>(SCOPE, chatId);
    if (stored && this.isAllowed(stored)) return path.resolve(stored);
    return path.resolve(this.config.defaultProjectPath);
  }

  bind(chatId: string, requestedPath: string): string {
    const resolved = path.resolve(requestedPath);
    if (!this.isAllowed(resolved)) {
      throw new Error(`project path is outside allowed roots: ${resolved}`);
    }
    this.state.setUiState(SCOPE, chatId, resolved);
    return resolved;
  }

  isAllowed(projectPath: string): boolean {
    const resolved = path.resolve(projectPath);
    const roots = this.allowedRoots();
    return roots.some((root) => isInside(root, resolved));
  }

  allowedRoots(): string[] {
    const configured = this.config.allowedRoots.length
      ? this.config.allowedRoots
      : [this.config.defaultProjectPath];
    return configured.map((root) => path.resolve(root));
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
