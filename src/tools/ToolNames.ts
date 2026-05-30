export const ToolNames = {
  ReadFile: "read_file",
  WriteFile: "write_file",
  ListFiles: "list_files",
  GlobFiles: "glob_files",
  GrepFiles: "grep_files",
  ApplyPatch: "apply_patch",
  RunCommand: "run_command",
  SshRun: "ssh_run",
  SshReadFile: "ssh_read_file",
  SshWriteFile: "ssh_write_file",
  TodoWrite: "TodoWrite",
  EnterPlanMode: "EnterPlanMode",
  ExitPlanMode: "ExitPlanMode",
  ValidateArtifact: "validate_artifact",
  BrowserSessionStart: "browser_session_start",
  CreateDocx: "create_docx",
  CreatePdf: "create_pdf",
  ComputerUse: "computer_use",
} as const;

export type ToolName = (typeof ToolNames)[keyof typeof ToolNames];
