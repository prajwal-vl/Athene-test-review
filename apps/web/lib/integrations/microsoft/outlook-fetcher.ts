import { microsoftGraphFetch } from "@/lib/integrations/microsoft/graph-client";

export async function readUnreadOutlookMessages(accessToken: string) {
  return microsoftGraphFetch<any>(accessToken, "/me/messages?$filter=isRead eq false&$top=20");
}
