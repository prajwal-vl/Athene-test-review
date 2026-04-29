import { Receiver } from '@upstash/qstash';

export const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || '',
});

/**
 * Validates the Upstash signature of an incoming webhook request.
 * MUST be called before fulfilling any background job worker request.
 */
export async function verifyQStashSignature(req: Request): Promise<boolean> {
  try {
    const signature = req.headers.get('upstash-signature');
    if (!signature) {
      return false;
    }
    
    // We clone the request so that consuming its raw text doesn't 
    // prevent the downstream route logic from parsing JSON later.
    const body = await req.clone().text();

    const isValid = await receiver.verify({
      signature,
      body,
    });

    return isValid;
  } catch (err) {
    console.error('[QStash] Signature verification failed:', err);
    return false;
  }
}
