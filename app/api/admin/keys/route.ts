import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const { userId, orgId } = await auth()
  
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  return NextResponse.json({ 
    status: 'ok',
    userId,
    orgId
  })
}
