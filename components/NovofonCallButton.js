'use client'

import { faHeadset } from '@fortawesome/free-solid-svg-icons/faHeadset'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useAtomValue } from 'jotai'
import cn from 'classnames'
import { getCustomValue } from '@helpers/customSettings'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'

const NOVOFON_ANDROID_PACKAGE = 'ru.novofon.mobile'

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  return digits
}

const buildNovofonCallUrl = (phone) => {
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) return ''
  const telUrl = `tel:+${normalizedPhone}`

  if (
    typeof navigator !== 'undefined' &&
    /Android/i.test(navigator.userAgent || '')
  ) {
    return `intent://+${normalizedPhone}#Intent;scheme=tel;package=${NOVOFON_ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(telUrl)};end`
  }

  return telUrl
}

const NovofonCallButton = ({
  client,
  className,
  size = 'lg',
  withTitle = false,
}) => {
  const loggedUser = useAtomValue(loggedUserAtom)
  const siteSettings = useAtomValue(siteSettingsAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const tariffAccess = getUserTariffAccess(loggedUser, tariffs)
  const custom = siteSettings?.custom ?? {}
  const novofonEnabled = getCustomValue(custom, 'novofonEnabled') === true
  const canUseTelephony = Boolean(tariffAccess?.allowTelephony)
  const phone = normalizePhone(client?.phone || client?.whatsapp)
  const url = buildNovofonCallUrl(phone)

  if (!client?._id || !phone || !novofonEnabled || !canUseTelephony || !url) {
    return null
  }

  const openNovofon = (event) => {
    event.stopPropagation()
    window.location.href = url
  }

  if (withTitle) {
    return (
      <button
        type="button"
        className={cn(
          'group flex cursor-pointer items-center gap-x-2 text-left',
          className
        )}
        onClick={openNovofon}
        title="Позвонить через Novofon"
      >
        <div className="flex w-6 items-center justify-center">
          <FontAwesomeIcon
            icon={faHeadset}
            className="h-6 text-yellow-600 duration-300 group-hover:scale-115 group-hover:text-toxic"
            size={size}
          />
        </div>
        <span className="group-hover:text-toxic">Novofon</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        'flex h-6 w-6 cursor-pointer items-center justify-center text-yellow-600 duration-300 hover:scale-110 hover:text-toxic',
        className
      )}
      onClick={openNovofon}
      title="Позвонить через Novofon"
    >
      <FontAwesomeIcon icon={faHeadset} size={size} />
    </button>
  )
}

export default NovofonCallButton
