import { Receiver } from "@upstash/qstash";
import { requireEnv } from "@/lib/env";

let receiver: Receiver | null = null;

function getReceiver() {
  if (!receiver) {
    receiver = new Receiver({
      currentSigningKey: requireEnv("QSTASH_CURRENT_SIGNING_KEY"),
      nextSigningKey: requireEnv("QSTASH_NEXT_SIGNING_KEY"),
    });
  }
  return receiver;
}

export async function verifyQStashRequest(req: Request, body: string) {
  const signature = req.headers.get("upstash-signature");
  if (!signature) return false;
  return getReceiver().verify({ signature, body });
}
