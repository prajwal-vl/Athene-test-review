export const emailSendTool = {
  name: "email-send",
  requiresApproval: true,
};

export function createEmailApproval(args: Record<string, unknown>) {
  const to = String(args.to || "recipient");
  const subject = String(args.subject || "No subject");
  return {
    tool_name: emailSendTool.name,
    tool_args: args,
    description: `Send email to ${to}: ${subject}`,
  };
}
