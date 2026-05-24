import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import PhoneConfirms from '@models/PhoneConfirms'
import {
  findUserByPhone,
  generateSmsCode,
  getExpiresAt,
  isValidNormalizedPhone,
  normalizePhone,
  safeApiError,
  sendSmsCode,
  validateFlow,
  verifyConfig,
} from '@server/phoneVerification'

const isCooldownActive = (date, cooldownSec) =>
  date && Date.now() - new Date(date).getTime() < cooldownSec * 1000

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const requestedFlow = body.flow
  const phone = normalizePhone(body.phone)

  if (requestedFlow && !validateFlow(requestedFlow)) {
    return NextResponse.json(
      safeApiError('INVALID_FLOW', 'Некорректный режим проверки', 'flow'),
      { status: 400 }
    )
  }

  if (!isValidNormalizedPhone(phone)) {
    return NextResponse.json(
      safeApiError('INVALID_PHONE', 'Введите корректный номер телефона', 'phone'),
      { status: 400 }
    )
  }

  await dbConnect()

  const confirmQuery = requestedFlow
    ? { phone, flow: requestedFlow }
    : { phone }
  const confirm = await PhoneConfirms.findOne(confirmQuery)
  if (!confirm) {
    return NextResponse.json(
      safeApiError(
        'CONFIRM_NOT_FOUND',
        'Сначала запустите проверку номера по звонку'
      ),
      { status: 404 }
    )
  }
  const flow = confirm.flow
  const user = await findUserByPhone(phone)
  if (flow === 'register' && user) {
    return NextResponse.json(
      safeApiError('PHONE_ALREADY_USED', 'Пользователь с таким номером уже существует', 'phone'),
      { status: 409 }
    )
  }
  if (flow === 'recovery' && !user) {
    return NextResponse.json(
      safeApiError('PHONE_NOT_FOUND', 'Пользователь с таким номером не найден', 'phone'),
      { status: 404 }
    )
  }

  if (confirm.confirmed) {
    return NextResponse.json(
      { success: true, data: { smsSent: false, alreadyConfirmed: true } },
      { status: 200 }
    )
  }

  if (confirm.smsSendNum >= verifyConfig.maxSmsSends) {
    return NextResponse.json(
      safeApiError(
        'SMS_SEND_LIMIT',
        'Достигнут лимит отправки SMS-кодов'
      ),
      { status: 429 }
    )
  }

  if (isCooldownActive(confirm.smsSentAt, verifyConfig.smsCooldownSec)) {
    return NextResponse.json(
      safeApiError('SMS_RATE_LIMIT', 'Слишком частая отправка SMS-кода'),
      { status: 429 }
    )
  }

  const code = generateSmsCode()
  let sendResult
  try {
    sendResult = await sendSmsCode({ phone, code, flow })
  } catch (error) {
    console.error('[phone/verify/sms/send] SMS provider error', error)
    return NextResponse.json(
      safeApiError('SMS_SEND_ERROR', 'Не удалось отправить SMS-код'),
      { status: 500 }
    )
  }

  if (!sendResult.ok) {
    return NextResponse.json(sendResult.error, { status: 503 })
  }

  confirm.code = code
  confirm.confirmed = false
  confirm.tryNum = 0
  confirm.smsSentAt = new Date()
  confirm.smsSendNum += 1
  confirm.expiresAt = getExpiresAt()
  await confirm.save()

  return NextResponse.json(
    {
      success: true,
      data: {
        smsSent: true,
        ...(sendResult.debugCode ? { debugCode: sendResult.debugCode } : {}),
      },
    },
    { status: 200 }
  )
}
