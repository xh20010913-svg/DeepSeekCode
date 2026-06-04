import path from "node:path";

export type RemoteDeliveryKind =
  | "image"
  | "html"
  | "office"
  | "pdf"
  | "text"
  | "code"
  | "archive"
  | "file";

export interface RemoteDeliveryArtifact {
  path: string;
  fullPath: string;
  kind?: string;
  sizeBytes: number;
}

export interface RemoteDeliveryCandidate extends RemoteDeliveryArtifact {
  deliveryKind: RemoteDeliveryKind;
  priority: number;
  canPreview: boolean;
  canSendFile: boolean;
  wechatPreviewable: boolean;
}

export interface RemoteDeliveryPlan {
  candidates: RemoteDeliveryCandidate[];
  preview?: RemoteDeliveryCandidate;
  files: RemoteDeliveryCandidate[];
  summaryNeeded: boolean;
}

export function planRemoteDelivery(artifacts: RemoteDeliveryArtifact[]): RemoteDeliveryPlan {
  const candidates = artifacts
    .map(classifyDeliveryArtifact)
    .sort((a, b) => b.priority - a.priority);
  const preview = candidates.find((candidate) => candidate.deliveryKind === "image")
    ?? candidates.find((candidate) => candidate.deliveryKind === "html")
    ?? candidates.find((candidate) => candidate.deliveryKind === "pdf")
    ?? candidates.find((candidate) => candidate.deliveryKind === "office");
  const files = uniqueByPath([
    ...candidates.filter((candidate) => ["office", "pdf", "html", "archive"].includes(candidate.deliveryKind)),
    ...candidates.filter((candidate) => candidate.deliveryKind === "image"),
    ...candidates.filter((candidate) => candidate.deliveryKind === "text"),
    ...candidates.filter((candidate) => candidate.deliveryKind === "file" || candidate.deliveryKind === "code"),
  ]).filter((candidate) => candidate.canSendFile);
  return {
    candidates,
    preview,
    files,
    summaryNeeded: candidates.length === 0,
  };
}

export function classifyDeliveryArtifact(artifact: RemoteDeliveryArtifact): RemoteDeliveryCandidate {
  const lower = artifact.fullPath.toLowerCase();
  const ext = path.extname(lower);
  const kind = artifact.kind?.toLowerCase();
  if (kind === "image" || kind === "screenshot" || [".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return candidate(artifact, "image", 100, true);
  }
  if (kind === "html" || ext === ".html" || ext === ".htm") {
    return candidate(artifact, "html", 95, true);
  }
  if (kind === "pptx" || kind === "docx" || [".docx", ".pptx", ".xlsx"].includes(ext)) {
    return candidate(artifact, "office", 90, true);
  }
  if (kind === "pdf" || ext === ".pdf") {
    return candidate(artifact, "pdf", 88, true);
  }
  if ([".zip", ".7z", ".tar", ".gz"].includes(ext)) {
    return candidate(artifact, "archive", 75, false);
  }
  if (kind === "markdown" || [".md", ".markdown", ".txt"].includes(ext)) {
    return candidate(artifact, "text", 65, false);
  }
  if ([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".css", ".json", ".yaml", ".yml"].includes(ext)) {
    return candidate(artifact, "code", 55, false);
  }
  return candidate(artifact, "file", 40, false);
}

function candidate(
  artifact: RemoteDeliveryArtifact,
  deliveryKind: RemoteDeliveryKind,
  priority: number,
  canPreview: boolean,
): RemoteDeliveryCandidate {
  return {
    ...artifact,
    deliveryKind,
    priority,
    canPreview,
    wechatPreviewable: canOpenInWeChat(artifact.fullPath, deliveryKind),
    canSendFile: artifact.sizeBytes > 0 &&
      artifact.sizeBytes <= 30 * 1024 * 1024 &&
      canOpenInWeChat(artifact.fullPath, deliveryKind),
  };
}

function canOpenInWeChat(filePath: string, deliveryKind: RemoteDeliveryKind): boolean {
  if (deliveryKind === "office" || deliveryKind === "pdf") return true;
  const ext = path.extname(filePath).toLowerCase();
  return [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pdf"].includes(ext);
}

function uniqueByPath(candidates: RemoteDeliveryCandidate[]): RemoteDeliveryCandidate[] {
  const seen = new Set<string>();
  const result: RemoteDeliveryCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.fullPath.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}
