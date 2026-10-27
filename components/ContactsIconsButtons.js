import cn from 'classnames'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEnvelope } from '@fortawesome/free-regular-svg-icons/faEnvelope'
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons/faWhatsapp'
import { faViber } from '@fortawesome/free-brands-svg-icons/faViber'
import { faTelegramPlane } from '@fortawesome/free-brands-svg-icons/faTelegramPlane'
import { faInstagram } from '@fortawesome/free-brands-svg-icons/faInstagram'
import { faVk } from '@fortawesome/free-brands-svg-icons/faVk'
import { faPhone } from '@fortawesome/free-solid-svg-icons/faPhone'
import { faSms } from '@fortawesome/free-solid-svg-icons/faSms'
import ClientChatButton from '@components/ClientChatButton'
import NovofonCallButton from '@components/NovofonCallButton'
import { getMaxContactAction } from '@helpers/maxContact'
import useSnackbar from '@helpers/useSnackbar'

const ContactIconBtn = ({ url, icon, size = 'lg', className = null, title }) => (
  <button type="button" title={title} aria-label={title} className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50" onClick={(event) => { event.stopPropagation(); window.open(url, '_blank', 'noopener,noreferrer') }}>
  <FontAwesomeIcon
    className={cn(
      'hover:text-toxic h-6 cursor-pointer duration-300 hover:scale-110',
      className
    )}
    icon={icon}
    size={size}
  />
  </button>
)

const ContactIconBtnWithTitle = ({
  url,
  icon,
  size = 'lg',
  className = null,
  title,
}) => (
  <button type="button" title={title} aria-label={title}
    className="group flex min-h-10 cursor-pointer items-center gap-x-2"
    onClick={(event) => {
      event.stopPropagation()
      window.open(url, '_blank', 'noopener,noreferrer')
    }}
  >
    <div className="flex w-6 items-center justify-center">
      <FontAwesomeIcon
        className={cn(
          'group-hover:text-toxic h-6 duration-300 group-hover:scale-115',
          className
        )}
        icon={icon}
        size={size}
      />
    </div>
    <span className="group-hover:text-toxic">{title}</span>
  </button>
)

const ContactsIconsButtons = ({
  user,
  withTitle,
  grid,
  className,
  message,
  smsViaPhone,
  forceWhatsApp = false,
  forceTelegram = false,
  showChat = false,
}) => {
  const snackbar = useSnackbar()
  const maxAction = getMaxContactAction(user?.max || user?.phone)
  const Btn = withTitle ? ContactIconBtnWithTitle : ContactIconBtn

  const encodedMessage =
    message !== undefined && message !== null
      ? encodeURIComponent(message)
      : undefined

  return (
    <div
      className={cn(
        'my-1 items-center gap-y-2',
        grid
          ? 'laptop:grid-cols-3 tablet:grid-cols-2 grid grid-cols-1'
          : 'flex flex-wrap',
        withTitle ? 'gap-x-3' : 'gap-x-2',
        className
      )}
    >
      {user?.phone && (
        <Btn
          icon={message || smsViaPhone ? faSms : faPhone}
          className="text-yellow-600"
          url={
            message
              ? `sms:+${user.phone}?body=${encodedMessage}`
              : smsViaPhone
                ? `sms:+${user.phone}`
                : `tel:+${user.phone}`
          }
          title={`${message || smsViaPhone ? 'SMS' : 'Позвонить'}: +${user.phone}`}
        />
      )}
      {user?.whatsapp ? (
        <Btn
          icon={faWhatsapp}
          className="text-green-600"
          url={`https://wa.me/${user.whatsapp}${
            message ? `?text=${encodedMessage}` : ''
          }`}
          title={`WhatsApp: +${user.whatsapp}`}
        />
      ) : (
        forceWhatsApp &&
        user?.phone && (
          <Btn
            icon={faWhatsapp}
            className="text-red-400"
            url={`https://wa.me/${user.phone}${
              message ? `?text=${encodedMessage}` : ''
            }`}
            title={`WhatsApp: +${user.phone}`}
          />
        )
      )}
      {!message && user?.viber && (
        <Btn
          icon={faViber}
          className="text-purple-600"
          url={'viber://chat?number=' + user.viber}
          title={`Viber: +${user.viber}`}
        />
      )}

      {!message &&
        (user?.telegram ? (
          <Btn
            icon={faTelegramPlane}
            className="text-blue-600"
            url={`tg://resolve?domain=${user.telegram}`}
            title={`Telegram: @${user.telegram}`}
          />
        ) : (
          forceTelegram &&
          user?.phone && (
            <Btn
              icon={faTelegramPlane}
              className="text-red-400"
              url={`tg://resolve?phone=${user.phone}`}
              title={`Telegram: +${user.phone}`}
            />
          )
        ))}
      {!message && user?.instagram && (
        <Btn
          icon={faInstagram}
          className="text-yellow-700"
          url={'https://instagram.com/' + user.instagram}
          title={'@' + user.instagram}
        />
      )}
      {!message && user?.vk && (
        <Btn
          icon={faVk}
          url={'https://vk.com/' + user.vk}
          className="text-blue-600"
          title={'@' + user.vk}
        />
      )}
      {!message && user?.email && (
        <Btn
          icon={faEnvelope}
          className="text-red-400"
          url={'mailto:' + user.email}
          title={user.email}
        />
      )}
      {!message && maxAction && (
        <button type="button" className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 px-2 text-xs font-bold text-violet-700 hover:bg-violet-50"
          title={maxAction.type === 'phone' ? `Скопировать ${maxAction.phone} и открыть MAX` : 'Открыть контакт в MAX'}
          aria-label={maxAction.type === 'phone' ? `Скопировать ${maxAction.phone} и открыть MAX` : 'Открыть контакт в MAX'}
          onClick={async (event) => {
            event.stopPropagation()
            if (maxAction.type === 'phone') {
              try {
                await navigator.clipboard.writeText(maxAction.phone)
                snackbar.success('Номер скопирован — вставьте его в поиск MAX')
              } catch {
                snackbar.error(`Не удалось скопировать номер: ${maxAction.phone}`)
                return
              }
              window.location.href = maxAction.url
            } else window.open(maxAction.url, '_blank', 'noopener,noreferrer')
          }}>MAX{withTitle ? <span>{maxAction.label}</span> : null}</button>
      )}
      {!message && showChat && (
        <NovofonCallButton client={user} withTitle={withTitle} />
      )}
      {!message && showChat && (
        <ClientChatButton clientId={user?._id} withTitle={withTitle} />
      )}
    </div>
  )
}

export default ContactsIconsButtons
