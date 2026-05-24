import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import { processCallRecording } from '@server/calls'
import { requireAiTariffAccess } from '@server/telephonyAccess'

export const POST = async (req, { params }) => {
  const { id } = await params
  const access = await requireAiTariffAccess()
  if (!access.ok) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    )
  }

  await dbConnect()
  try {
    const call = await processCallRecording(id, access.tenantId)
    return NextResponse.json({ success: true, data: call }, { status: 200 })
  } catch (error) {
    const message =
      error?.message === 'TRANSCRIPTION_API_KEY_REQUIRED'
        ? 'Не настроен провайдер распознавания аудио'
        : 'Не удалось распознать запись звонка'
    console.error('[calls/process-recording] failed', {
      callId: id,
      message: error?.message,
    })
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 }
    )
  }
}
