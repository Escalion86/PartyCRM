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

const ContactIconBtn = ({ url, icon, size = 'lg', className = null }) => (
  <FontAwesomeIcon
    className={cn(
      'hover:text-toxic h-6 cursor-pointer duration-300 hover:scale-110',
      className
    )}
    icon={icon}
    onClick={(event) => {
      event.stopPropagation()
      window.open(url)
    }}
    size={size}
  />
)

const ContactIconBtnWithTitle = ({
  url,
  icon,
  size = 'lg',
  className = null,
  title,
}) => (
  <div
    className="group flex cursor-pointer items-center gap-x-2"
    onClick={(event) => {
      event.stopPropagation()
      window.open(url)
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
  </div>
)

const ContactsIconsButtons = ({
  user,
  withTitle,
  grid,
  className,
  message,
  smsViaPhone,
  forceWhatsApp = true,
  forceTelegram = true,
  showChat = false,
}) => {
  const Btn = withTitle ? ContactIconBtnWithTitle : ContactIconBtn

  const encodedMessage =
    message !== undefined || message !== null
      ? encodeURIComponent(message)
      : undefined

  return (
    <div
      className={cn(
        'my-1 items-center gap-y-2',
        grid
          ? 'laptop:grid-cols-3 tablet:grid-cols-2 grid grid-cols-1'
          : 'flex',
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
          title={'+' + user.phone}
        />
      )}
      {user?.whatsapp ? (
        <Btn
          icon={faWhatsapp}
          className="text-green-600"
          url={`https://wa.me/${user.whatsapp}${
            message ? `?text=${encodedMessage}` : ''
          }`}
          title={'+' + user.whatsapp}
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
            title={'+' + user.phone}
          />
        )
      )}
      {!message && user?.viber && (
        <Btn
          icon={faViber}
          className="text-purple-600"
          url={'viber://chat?number=' + user.viber}
          title={'+' + user.viber}
        />
      )}

      {!message &&
        (user?.telegram ? (
          <Btn
            icon={faTelegramPlane}
            className="text-blue-600"
            url={`https://t.me/${user.telegram}`}
            title={'@' + user.telegram}
          />
        ) : (
          forceTelegram &&
          user?.phone && (
            <Btn
              icon={faTelegramPlane}
              className="text-red-400"
              url={`https://t.me/+${user.phone}`}
              title={'+' + user.phone}
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
