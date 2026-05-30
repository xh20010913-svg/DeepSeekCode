export interface ToolPermissionContextValue {
  mode: "safe" | "dev" | "browser" | "open";
  canUseTool: (tool: string) => boolean;
}

export const defaultToolPermissionContext: ToolPermissionContextValue = {
  mode: "safe",
  canUseTool: () => false,
};

export default defaultToolPermissionContext;
