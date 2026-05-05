export async function readUnreadGmailMessages(accessToken: string) {
  const list = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=20", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!list.ok) throw new Error(`Gmail unread list failed: ${list.status}`);
  return list.json();
}
