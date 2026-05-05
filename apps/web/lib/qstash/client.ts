import { Client } from "@upstash/qstash";
import { requireEnv } from "@/lib/env";

let qstash: Client | null = null;

export function getQStashClient() {
  if (!qstash) qstash = new Client({ token: requireEnv("QSTASH_TOKEN") });
  return qstash;
}
