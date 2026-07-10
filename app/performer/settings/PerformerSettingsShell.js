'use client'

export default function PerformerSettingsShell({
  title,
  description = '',
  children,
}) {
  return (
    <section
      className="bg-white px-5 py-8"
      style={{ minHeight: 'calc(100dvh - 4rem)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold uppercase text-sky-700">
            Настройки кабинета
          </p>
          <h2 className="text-2xl font-semibold">{title}</h2>
          {description ? (
            <p className="text-sm leading-6 text-slate-500">{description}</p>
          ) : null}
        </div>

        {children}
      </div>
    </section>
  )
}
