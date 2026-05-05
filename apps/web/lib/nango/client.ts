import { Nango } from "@nangohq/node";
import { requireEnv } from "@/lib/env";

export type SourceType =
  | "sharepoint"
  | "onedrive"
  | "gdrive"
  | "jira"
  | "confluence"
  | "notion"
  | "outlook"
  | "gmail";

export const providerConfigBySource: Record<SourceType, string> = {
  sharepoint: "microsoft",
  onedrive: "microsoft",
  outlook: "microsoft",
  gdrive: "google",
  gmail: "google",
  jira: "atlassian",
  confluence: "atlassian",
  notion: "notion",
};

let nango: Nango | null = null;

export function getNangoClient() {
  if (!nango) nango = new Nango({ secretKey: requireEnv("NANGO_SECRET_KEY") });
  return nango;
}

export async function withNangoAccess<T>(
  sourceType: SourceType,
  connectionId: string,
  fn: (accessToken: string) => Promise<T>,
) {
  const token = await getNangoClient().getToken(providerConfigBySource[sourceType], connectionId);
  if (typeof token !== "string") throw new Error(`Nango connection ${connectionId} did not return an OAuth access token`);
  return fn(token);
}
