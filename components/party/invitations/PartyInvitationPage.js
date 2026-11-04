import Image from 'next/image'

export default function PartyInvitationPage({ invitation, embedded = false }) {
  const {
    heading,
    message,
    instructions,
    logoUrl,
    backgroundUrl,
    accentColor,
    backgroundColor,
    textColor,
    publicContact,
    companyTitle,
    eventDate,
    dateEnd,
    timeZone,
    locationTitle,
    address,
    showEndTime,
  } = invitation
  const date = eventDate ? new Date(eventDate) : null
  const day = date?.toLocaleDateString('ru-RU', {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  })
  const time = date?.toLocaleTimeString('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <main
      className={`grid place-items-center px-4 py-10 selection:bg-sky-200 ${embedded ? 'min-h-0' : 'min-h-dvh'}`}
      style={{ backgroundColor, color: textColor }}
    >
      <article className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-lg">
        {backgroundUrl ? (
          <div
            className="h-48 bg-cover bg-center sm:h-72"
            style={{ backgroundImage: `url(${JSON.stringify(backgroundUrl)})` }}
          />
        ) : null}
        <div className="space-y-7 p-6 sm:p-10">
          {logoUrl ? (
            <Image
              unoptimized
              width={300}
              height={80}
              src={logoUrl}
              alt={companyTitle || 'Логотип организатора'}
              className="max-h-20 max-w-full object-contain object-left"
            />
          ) : companyTitle ? (
            <p className="text-sm font-semibold" style={{ color: accentColor }}>
              {companyTitle}
            </p>
          ) : null}
          <h1
            className="break-words text-3xl font-bold sm:text-4xl"
            style={{ color: accentColor }}
          >
            {heading}
          </h1>
          {message ? (
            <p className="whitespace-pre-wrap text-lg leading-8">{message}</p>
          ) : null}
          <dl className="border-current/15 space-y-5 border-y py-6">
            {date ? (
              <div>
                <dt className="text-sm font-semibold">Когда</dt>
                <dd className="mt-1 text-xl">
                  {day}
                  <br />
                  {time}
                  {showEndTime && dateEnd
                    ? ` — ${new Date(dateEnd).toLocaleTimeString('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' })}`
                    : ''}
                </dd>
              </div>
            ) : null}
            {locationTitle || address ? (
              <div>
                <dt className="text-sm font-semibold">Где</dt>
                <dd className="mt-1 break-words text-lg">
                  {locationTitle}
                  {locationTitle && address ? <br /> : null}
                  {address}
                </dd>
              </div>
            ) : null}
          </dl>
          {instructions ? (
            <p className="whitespace-pre-wrap leading-7">{instructions}</p>
          ) : null}
          {publicContact ? (
            <div>
              <h2 className="text-sm font-semibold">По вопросам праздника</h2>
              <p className="mt-1 whitespace-pre-wrap break-words">
                {publicContact}
              </p>
            </div>
          ) : null}
        </div>
      </article>
    </main>
  )
}
