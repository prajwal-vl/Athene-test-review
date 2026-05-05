import { microsoftGraphFetch } from "@/lib/integrations/microsoft/graph-client";

export async function readTodayMicrosoftCalendar(accessToken: string, start: string, end: string) {
  return microsoftGraphFetch<any>(
    accessToken,
    `/me/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$orderby=start/dateTime`,
  );
}
