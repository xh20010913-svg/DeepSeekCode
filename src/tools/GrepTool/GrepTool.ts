import type { Tool } from "../../Tool.js";
import { ToolNames } from "../ToolNames.js";
import { getToolByName } from "../toolLookup.js";

export const GrepTool: Tool = getToolByName(ToolNames.GrepFiles);
