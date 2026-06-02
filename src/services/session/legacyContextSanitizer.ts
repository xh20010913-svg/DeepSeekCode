export function sanitizeLegacyPlannerContext(value: string): string {
  return value
    .replace(/<tool_call\b[\s\S]*?<\/tool_call>/gi, "[legacy tool-call text omitted; use durable tool_result summaries instead]")
    .replace(/<invoke\b[\s\S]*?<\/invoke>/gi, "[legacy tool invocation text omitted; use durable tool_result summaries instead]")
    .replace(/ActionEnvelope/g, "legacy local tool plan")
    .replace(/action_plan_failed/g, "legacy_tool_planning_failed")
    .replace(/action_envelope_received/g, "legacy_tool_plan_received")
    .replace(/action_envelope_attempt/g, "legacy_tool_plan_attempt")
    .replace(/action plan repair/gi, "native tool planning retry")
    .replace(/action plan was empty/gi, "legacy tool planning response was empty")
    .replace(/action plan/gi, "tool planning");
}
