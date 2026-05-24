import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import PhoneConfirms from '@models/PhoneConfirms'
import {
  isValidNormalizedPhone,
  normalizePhone,
  safeApiError,
  validateFlow,
  verifyConfig,
} from '@server/phoneVerification'

const isExpired = (expiresAt) =>
  !expiresAt || new Date(expiresAt).getTime() <= Date.now()

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const requestedFlow = body.flow
  const phone = normalizePhone(body.phone)
  const code = String(body.code || '').replace(/[^\d]/g, '')

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

  if (!code) {
    return NextResponse.json(
      safeApiError('INVALID_SMS_CODE', 'Введите код из SMS', 'code'),
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
      safeApiError('CONFIRM_NOT_FOUND', 'Проверка номера не найдена'),
      { status: 404 }
    )
  }

  if (isExpired(confirm.expiresAt)) {
    return NextResponse.json(
      safeApiError('CONFIRM_EXPIRED', 'Срок действия кода истек'),
      { status: 410 }
    )
  }

  if (!confirm.code) {
    return NextResponse.json(
      safeApiError('SMS_NOT_SENT', 'Сначала отправьте SMS-код'),
      { status: 400 }
    )
  }

  if (confirm.tryNum >= verifyConfig.maxSmsCheckTries) {
    return NextResponse.json(
      safeApiError('SMS_CHECK_LIMIT', 'Исчерпан лимит попыток ввода кода'),
      { status: 429 }
    )
  }

  if (confirm.code !== code) {
    confirm.tryNum += 1
    await confirm.save()
    return NextResponse.json(
      safeApiError('SMS_CODE_INVALID', 'Неверный код подтверждения', 'code'),
      { status: 400 }
    )
  }

  confirm.confirmed = true
  confirm.code = ''
  confirm.tryNum = 0
  await confirm.save()

  return NextResponse.json(
    { success: true, data: { confirmed: true } },
    { status: 200 }
  )
}
