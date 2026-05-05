export const calendarCreateTool = {
  name: "calendar-create",
  requiresApproval: true,
};

export function createCalendarApproval(args: Record<string, unknown>) {
  return {
    tool_name: calendarCreateTool.name,
    tool_args: args,
    description: `Create calendar event: ${String(args.title || args.subject || "Untitled event")}`,
  };
}
