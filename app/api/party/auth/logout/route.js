import { NextResponse } from 'next/server'
import { clearPartySessionCookie } from '@server/partyAuth'

export async function POST() {
  return clearPartySessionCookie(NextResponse.json({ success: true }))
}
