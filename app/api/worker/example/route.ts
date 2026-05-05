import { NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/lib/qstash/verify';
import { releaseSlot } from '@/lib/qstash/client';

export async function POST(req: Request) {
  const isValid = await verifyQStashSignature(req);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 });
  }

  let body: { orgId?: string; sourceType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { orgId, sourceType } = body;
  if (!orgId || !sourceType) {
    return NextResponse.json({ error: 'Missing required fields: orgId, sourceType' }, { status: 400 });
  }

  // TODO (W4): implement real job logic here

  await releaseSlot(orgId, sourceType);
  return NextResponse.json({ success: true });
}
