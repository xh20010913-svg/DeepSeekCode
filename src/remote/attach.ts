export interface AttachTarget {
  runId: string;
  projectPath: string;
  status: string;
}

export function describeAttachTarget(target: AttachTarget): string {
  return `${target.runId} ${target.status} ${target.projectPath}`;
}
