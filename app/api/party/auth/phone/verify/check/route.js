import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import PhoneConfirms from '@models/PhoneConfirms'
import {
  isValidNormalizedPhone,
  normalizePhone,
  safeApiError,
  telefonipCheckCall,
  verifyConfig,
} from '@server/phoneVerification'

const isExpired = (expiresAt) =>
  !expiresAt || new Date(expiresAt).getTime() <= Date.now()

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(body.phone)
  const callId = Number(body.callId)

  if (!isValidNormalizedPhone(phone)) {
    return NextResponse.json(
      safeApiError('INVALID_PHONE', 'Введите корректный номер телефона', 'phone'),
      { status: 400 }
    )
  }
  if (!Number.isFinite(callId)) {
    return NextResponse.json(
      safeApiError('INVALID_CALL_ID', 'Некорректный идентификатор звонка', 'callId'),
      { status: 400 }
    )
  }

  await dbConnect()

  const confirm = await PhoneConfirms.findOne({
    phone,
    callId,
  })

  if (!confirm) {
    return NextResponse.json(
      safeApiError('CONFIRM_NOT_FOUND', 'Проверка номера не найдена'),
      { status: 404 }
    )
  }

  if (isExpired(confirm.expiresAt)) {
    return NextResponse.json(
      {
        success: true,
        data: {
          status: 'expired',
          confirmed: false,
        },
      },
      { status: 200 }
    )
  }

  if (
    confirm.lastCheckAt &&
    Date.now() - new Date(confirm.lastCheckAt).getTime() <
      verifyConfig.checkCooldownSec * 1000
  ) {
    return NextResponse.json(
      safeApiError('CHECK_RATE_LIMIT', 'Слишком частые проверки статуса'),
      { status: 429 }
    )
  }

  let checkResult
  try {
    checkResult = await telefonipCheckCall(callId)
  } catch (error) {
    console.error('[phone/verify/check] TELEFONIP unavailable', error)
    return NextResponse.json(
      safeApiError(
        'TELEFONIP_UNAVAILABLE',
        'Сервис подтверждения телефона временно недоступен'
      ),
      { status: 503 }
    )
  }

  confirm.lastCheckAt = new Date()

  if (!checkResult.ok) {
    await confirm.save()
    return NextResponse.json(checkResult.error, { status: 502 })
  }

  const status = checkResult.data.status
  const isOkStatus = status === 'ok' || status === 'success'
  const phoneMatched =
    !checkResult.data.authPhone || checkResult.data.authPhone === phone

  if (isOkStatus && phoneMatched) {
    confirm.confirmed = true
  }

  await confirm.save()

  return NextResponse.json(
    {
      success: true,
      data: {
        status,
        confirmed: Boolean(confirm.confirmed),
      },
    },
    { status: 200 }
  )
}
