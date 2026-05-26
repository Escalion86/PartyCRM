'use client'

import useCompanySettings from '../useCompanySettings'

export default function CompanySettingsListsContent({ activeCompanyId }) {
  const { settings, loading, saving, error, savePatch } =
    useCompanySettings(activeCompanyId)

  if (loading) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm text-slate-500">
        Загружаем списки компании...
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
        <div className="mb-2 text-sm font-semibold">Города</div>
        <p className="mb-3 text-xs leading-5 text-slate-500">
          Один город на строку. Список используется в заказах и адресах
          клиентов.
        </p>
        <textarea
          key={(settings?.towns ?? []).join('|')}
          defaultValue={(settings?.towns ?? []).join('\n')}
          onBlur={(event) => savePatch({ towns: event.target.value.split('\n') })}
          className="min-h-40 w-full rounded-lg border border-sky-100 px-3 py-3 text-sm"
        />
      </div>

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="mb-2 text-sm font-semibold">Типы мероприятий</div>
        <p className="mb-3 text-xs leading-5 text-slate-500">
          Один тип на строку. Это будущий справочник для заказов и фильтров.
        </p>
        <textarea
          key={(settings?.eventTypes ?? []).join('|')}
          defaultValue={(settings?.eventTypes ?? []).join('\n')}
          onBlur={(event) =>
            savePatch({ eventTypes: event.target.value.split('\n') })
          }
          className="min-h-40 w-full rounded-lg border border-sky-100 px-3 py-3 text-sm"
        />
      </div>

      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-5 text-sm leading-6 text-slate-600">
        Сохраненные адреса клиентов продолжают пополняться прямо из формы
        заказа. Отдельный редактор адресного пула можно вынести в следующем
        инкременте, если понадобится управление удалением и ручная правка.
      </div>

      {saving ? (
        <p className="text-xs text-slate-500">Сохраняем изменения...</p>
      ) : null}
    </div>
  )
}
