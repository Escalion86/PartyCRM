import { useEffect, useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import CardButtons from '@components/CardButtons'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import SurfaceCard from '@components/SurfaceCard'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  useClientQuery,
  useClientRelationsQuery,
  useClientsQuery,
} from '@helpers/useClientsQuery'

const CONTACT_CHANNEL_LABELS = {
  phone: 'Телефон',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  max: 'MAX',
  vk: 'VK',
  other: 'Другое',
}

const formatSignificantDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
  })
}

const SectionBlock = ({ title, action, children }) => (
  <SurfaceCard>
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      {action}
    </div>
    {children}
  </SurfaceCard>
)

const CardButtonsComponent = ({ client, onEdit }) => (
  <CardButtons
    item={client}
    typeOfItem="client"
    minimalActions
    alwaysCompact
    onEdit={onEdit}
    dropDownPlacement="left"
  />
)

const clientViewFunc = (clientId) => {
  const ClientViewModal = ({ setTopLeftComponent }) => {
    const { data: clients = [] } = useClientsQuery()
    const initialClient = useMemo(
      () => clients.find((item) => item._id === clientId) ?? null,
      [clients]
    )
    const { data: client = initialClient } = useClientQuery(
      clientId,
      initialClient
    )
    const modalsFunc = useAtomValue(modalsFuncAtom)
    const { data: relations } = useClientRelationsQuery(clientId)
    const events = useMemo(() => relations?.events ?? [], [relations?.events])
    const transactions = useMemo(
      () => relations?.transactions ?? [],
      [relations?.transactions]
    )

    const now = new Date()
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime()

    const clientEvents = useMemo(() => {
      if (!clientId) return []
      return events.filter((event) => event.clientId === clientId)
    }, [events])

    const canceledCount = clientEvents.filter(
      (event) => event.status === 'canceled'
    ).length

    const passedCount = clientEvents.filter((event) => {
      if (event.status === 'canceled') return false
      if (!event.eventDate) return false
      return new Date(event.eventDate).getTime() < startOfToday
    }).length

    const upcomingCount =
      clientEvents.filter((event) => {
        if (event.status === 'canceled') return false
        if (!event.eventDate) return true
        return new Date(event.eventDate).getTime() >= startOfToday
      }).length

    const clientTransactions = useMemo(() => {
      if (!clientId) return []
      return (transactions ?? []).filter(
        (transaction) => transaction.clientId === clientId
      )
    }, [transactions])

    const incomeTotal = clientTransactions.reduce(
      (total, item) =>
        item.type === 'income' ? total + (item.amount ?? 0) : total,
      0
    )
    const expenseTotal = clientTransactions.reduce(
      (total, item) =>
        item.type === 'expense' ? total + (item.amount ?? 0) : total,
      0
    )
    const balanceTotal = incomeTotal - expenseTotal
    const requisitesLines = useMemo(() => {
      if (!client) return []
      const rows = []
      if (client.legalName) rows.push(`Наименование: ${client.legalName}`)
      if (client.inn) rows.push(`ИНН: ${client.inn}`)
      if (client.kpp) rows.push(`КПП: ${client.kpp}`)
      if (client.ogrn) rows.push(`ОГРН/ОГРНИП: ${client.ogrn}`)
      if (client.bankName) rows.push(`Банк: ${client.bankName}`)
      if (client.bik) rows.push(`БИК: ${client.bik}`)
      if (client.checkingAccount)
        rows.push(`Расчетный счет: ${client.checkingAccount}`)
      if (client.correspondentAccount)
        rows.push(`Корр. счет: ${client.correspondentAccount}`)
      if (client.legalAddress) rows.push(`Юридический адрес: ${client.legalAddress}`)
      return rows
    }, [client])
    const significantDates = useMemo(
      () =>
        (Array.isArray(client?.significantDates)
          ? client.significantDates
          : []
        ).filter((item) => item?.title || item?.date || item?.comment),
      [client]
    )
    const preferredContactChannelLabel = useMemo(() => {
      if (!client?.preferredContactChannel) return ''
      if (client.preferredContactChannel === 'other')
        return client.preferredContactChannelOther?.trim() || 'Другое'
      return CONTACT_CHANNEL_LABELS[client.preferredContactChannel] || ''
    }, [client])

    useEffect(() => {
      if (setTopLeftComponent)
        setTopLeftComponent(() => (
          <CardButtonsComponent
            client={client}
            onEdit={() => modalsFunc.client?.edit(clientId)}
          />
        ))
    }, [client, modalsFunc.client, setTopLeftComponent])

    if (!clientId || !client)
      return (
        <div className="flex justify-center w-full text-lg ">
          ОШИБКА! Клиент не найден!
        </div>
      )

    const fullName = getPersonFullName(client, { fallback: 'Без имени' })
    const initials = fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('')

    return (
      <div className="flex flex-col gap-3 text-sm text-gray-800">
        <div className="client-view-header relative rounded-xl border p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="client-view-avatar flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-white text-base font-bold">
              {initials || 'К'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold text-gray-900">
                {fullName}
              </div>
              <div className="mt-0.5 text-gray-600">
                {client.phone ? `+${client.phone}` : 'Телефон не указан'}
              </div>
            </div>
          </div>
          {!setTopLeftComponent && (
            <div className="absolute right-4 top-4">
              <CardButtonsComponent
                client={client}
                onEdit={() => modalsFunc.client?.edit(clientId)}
              />
            </div>
          )}
          <div className="mt-2">
            <ContactsIconsButtons user={client} showChat />
          </div>
          {(preferredContactChannelLabel || client.comment) && (
            <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              {preferredContactChannelLabel && (
                <div>
                  <span className="font-semibold text-gray-900">
                    Приоритетная связь:
                  </span>{' '}
                  {preferredContactChannelLabel}
                </div>
              )}
              {client.comment && (
                <div className="whitespace-pre-wrap break-words">
                  <span className="font-semibold text-gray-900">
                    Комментарий:
                  </span>{' '}
                  {client.comment}
                </div>
              )}
            </div>
          )}
        </div>

        <SectionBlock
          title="Мероприятия"
          action={
            <button
              type="button"
              className="client-view-action-btn cursor-pointer rounded border px-3 py-1 text-xs font-semibold transition"
              onClick={() => modalsFunc.client?.events(clientId)}
            >
              Посмотреть
            </button>
          }
        >
          <div className="grid grid-cols-1 gap-2 tablet:grid-cols-3">
            <div className="client-view-kpi rounded-lg border border-gray-200 bg-gray-50 p-2">
              <div className="text-[11px] text-gray-500">Прошли</div>
              <div className="text-base font-semibold text-gray-900">{passedCount}</div>
            </div>
            <div className="client-view-kpi rounded-lg border border-gray-200 bg-gray-50 p-2">
              <div className="text-[11px] text-gray-500">Будут</div>
              <div className="text-base font-semibold text-gray-900">{upcomingCount}</div>
            </div>
            <div className="client-view-kpi rounded-lg border border-gray-200 bg-gray-50 p-2">
              <div className="text-[11px] text-gray-500">Отменены</div>
              <div className="text-base font-semibold text-gray-900">{canceledCount}</div>
            </div>
          </div>
        </SectionBlock>

        <SectionBlock
          title="Финансы по транзакциям"
          action={
            <button
              type="button"
              className="client-view-action-btn cursor-pointer rounded border px-3 py-1 text-xs font-semibold transition"
              onClick={() => modalsFunc.client?.transactions(clientId)}
            >
              Показать
            </button>
          }
        >
          <div className="grid grid-cols-1 gap-2 tablet:grid-cols-3">
            <div className="client-view-kpi-income rounded-lg border border-emerald-200 bg-emerald-50 p-2">
              <div className="text-[11px] text-emerald-700">Доходы</div>
              <div className="text-base font-semibold text-emerald-700">
                {incomeTotal.toLocaleString()} ₽
              </div>
            </div>
            <div className="client-view-kpi-expense rounded-lg border border-red-200 bg-red-50 p-2">
              <div className="text-[11px] text-red-700">Расходы</div>
              <div className="text-base font-semibold text-red-700">
                {expenseTotal.toLocaleString()} ₽
              </div>
            </div>
            <div className="client-view-kpi rounded-lg border border-gray-200 bg-gray-50 p-2">
              <div className="text-[11px] text-gray-500">Итог</div>
              <div className="text-base font-semibold text-gray-900">
                {balanceTotal.toLocaleString()} ₽
              </div>
            </div>
          </div>
        </SectionBlock>
        {requisitesLines.length > 0 && (
          <SectionBlock title="Реквизиты">
            <div className="space-y-1 text-sm text-gray-700">
              {requisitesLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </SectionBlock>
        )}

        {significantDates.length > 0 && (
          <SectionBlock title="Значимые даты">
            <div className="space-y-2 text-sm text-gray-700">
              {significantDates.map((item, index) => (
                <div
                  key={`${item.title || 'date'}-${item.date || index}`}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-2"
                >
                  <div className="font-semibold text-gray-900">
                    {item.title || 'Дата'}
                    {item.date ? `: ${formatSignificantDate(item.date)}` : ''}
                  </div>
                  {item.comment && (
                    <div className="mt-1 whitespace-pre-wrap break-words">
                      {item.comment}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SectionBlock>
        )}

      </div>
    )
  }

  return {
    title: 'Клиент',
    confirmButtonName: 'Закрыть',
    showDecline: false,
    onConfirm: true,
    Children: ClientViewModal,
  }
}

export default clientViewFunc
