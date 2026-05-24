import { NextResponse } from 'next/server'
import Calls from '@models/Calls'
import dbConnect from '@server/dbConnect'
import { analyzeCallTranscript } from '@server/callAiAnalysis'
import { getTenantAiSettings } from '@server/aiSettings'
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
  const { tenantId } = access

  await dbConnect()
  const call = await Calls.findOne({ _id: id, tenantId }).lean()
  if (!call) {
    return NextResponse.json(
      { success: false, error: 'Звонок не найден' },
      { status: 404 }
    )
  }

  await Calls.findOneAndUpdate(
    { _id: id, tenantId },
    { status: 'processing', processingError: '' }
  )

  try {
    const aiSettings = await getTenantAiSettings(access.tenantId)
    const analysis = await analyzeCallTranscript(call.transcript, aiSettings)
    const updatedCall = await Calls.findOneAndUpdate(
      { _id: id, tenantId },
      {
        status: 'ready',
        aiSummary: analysis.summary,
        aiExtractedFields: analysis.extractedFields,
        processingError: '',
      },
      { returnDocument: 'after' }
    ).lean()

    return NextResponse.json(
      { success: true, data: updatedCall },
      { status: 200 }
    )
  } catch (error) {
    const updatedCall = await Calls.findOneAndUpdate(
      { _id: id, tenantId },
      {
        status: 'failed',
        processingError: 'AI-анализ временно недоступен',
      },
      { returnDocument: 'after' }
    ).lean()
    console.error('[calls/analyze] failed', {
      callId: id,
      message: error?.message,
    })
    return NextResponse.json(
      {
        success: false,
        error: 'AI-анализ временно недоступен',
        data: updatedCall,
      },
      { status: 502 }
    )
  }
}
