import type { Tool } from "../../Tool.js";
import { ToolNames } from "../ToolNames.js";
import { getToolByName } from "../toolLookup.js";

export const FileEditTool: Tool = getToolByName(ToolNames.ApplyPatch);
