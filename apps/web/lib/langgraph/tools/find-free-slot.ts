export function findFreeSlot(events: Array<{ start?: { dateTime?: string }; end?: { dateTime?: string } }>, minutes = 30) {
  const now = new Date();
  const workEnd = new Date(now);
  workEnd.setHours(17, 0, 0, 0);
  const busy = events
    .map((event) => ({ start: new Date(event.start?.dateTime || 0), end: new Date(event.end?.dateTime || 0) }))
    .filter((event) => Number.isFinite(event.start.getTime()) && Number.isFinite(event.end.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  let cursor = new Date(Math.max(now.getTime(), new Date(now).setHours(9, 0, 0, 0)));
  for (const event of busy) {
    if (event.start.getTime() - cursor.getTime() >= minutes * 60_000) return cursor.toISOString();
    if (event.end > cursor) cursor = event.end;
  }
  return workEnd.getTime() - cursor.getTime() >= minutes * 60_000 ? cursor.toISOString() : null;
}
