'use client'

import useCompanySettings from '../useCompanySettings'

const DEFAULT_REMINDER_TIME = '10:00'

export default function CompanySettingsNotificationsContent({
  activeCompanyId,
}) {
  const { settings, loading, saving, error, savePatch } =
    useCompanySettings(activeCompanyId)

  const notifications = settings?.notifications ?? {}
  const pushEnabled = notifications.pushEnabled === true
  const reminderTime =
    typeof notifications.additionalEventsPushTime === 'string' &&
    notifications.additionalEventsPushTime
      ? notifications.additionalEventsPushTime
      : DEFAULT_REMINDER_TIME

  if (loading) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm text-slate-500">
        Загружаем настройки уведомлений...
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={pushEnabled}
            onChange={(event) =>
              savePatch({
                notifications: {
                  ...notifications,
                  pushEnabled: event.target.checked,
                },
              })
            }
            className="mt-1 cursor-pointer"
          />
          <div className="grid gap-1">
            <span className="text-sm font-semibold">
              Push-уведомления компании
            </span>
            <span className="text-xs leading-5 text-slate-500">
              Сохраняет company-level признак включения push. Интеграция с
              доставкой будет расширена отдельным backend-инкрементом.
            </span>
          </div>
        </label>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <label className="grid gap-2">
          <span className="text-sm font-semibold">
            Время ежедневных напоминаний
          </span>
          <input
            type="time"
            step="900"
            value={reminderTime}
            onChange={(event) =>
              savePatch({
                notifications: {
                  ...notifications,
                  additionalEventsPushTime: event.target.value,
                },
              })
            }
            className="h-11 max-w-52 rounded-lg border border-sky-100 px-3 text-sm"
          />
        </label>
      </div>

      {saving ? (
        <p className="text-xs text-slate-500">Сохраняем изменения...</p>
      ) : null}
    </div>
  )
}
