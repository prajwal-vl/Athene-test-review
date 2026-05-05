export async function readTodayGoogleCalendar(accessToken: string, start: string, end: string) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}&singleEvents=true&orderBy=startTime`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Google Calendar fetch failed: ${response.status}`);
  return response.json();
}
