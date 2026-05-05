export async function fetchGoogleDriveDocument(accessToken: string, sourceId: string) {
  const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sourceId)}?fields=id,name,webViewLink,modifiedTime,owners,emailAddress,mimeType`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metadataResponse.ok) throw new Error(`Google Drive metadata fetch failed: ${metadataResponse.status}`);
  const metadata = await metadataResponse.json();
  const contentResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sourceId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!contentResponse.ok) throw new Error(`Google Drive content fetch failed: ${contentResponse.status}`);
  return {
    content: await contentResponse.text(),
    title: metadata.name || sourceId,
    sourceUrl: metadata.webViewLink || "",
    author: metadata.owners?.[0]?.emailAddress || null,
    lastModified: metadata.modifiedTime || null,
  };
}
