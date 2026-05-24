'use client'

import { useMemo } from 'react'
import ContentHeader from '@components/ContentHeader'
import EmptyState from '@components/EmptyState'
import HeaderActions from '@components/HeaderActions'
import MutedText from '@components/MutedText'
import SectionCard from '@components/SectionCard'
import getPersonFullName from '@helpers/getPersonFullName'
import { useClientsQuery } from '@helpers/useClientsQuery'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'

const DAY_MS = 24 * 60 * 60 * 1000

const formatDate = (date) =>
  date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
  })

const formatDaysLeft = (daysLeft) => {
  if (daysLeft === 0) return 'Сегодня'
  if (daysLeft === 1) return 'Завтра'
  return `Через ${daysLeft} дн.`
}

const getNextAnnualDate = (value, now) => {
  if (!value) return null
  const source = new Date(value)
  if (Number.isNaN(source.getTime())) return null

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let next = new Date(
    today.getFullYear(),
    source.getMonth(),
    source.getDate()
  )
  if (next.getTime() < today.getTime()) {
    next = new Date(
      today.getFullYear() + 1,
      source.getMonth(),
      source.getDate()
    )
  }

  return next
}

const buildClientEvents = (clients) => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  return clients
    .flatMap((client) => {
      const significantDates = Array.isArray(client?.significantDates)
        ? client.significantDates
        : []

      return significantDates
        .map((item) => {
          const nextDate = getNextAnnualDate(item?.date, today)
          if (!nextDate) return null
          const daysLeft = Math.round(
            (nextDate.getTime() - today.getTime()) / DAY_MS
          )

          return {
            client,
            title: String(item?.title || 'Значимая дата').trim(),
            comment: String(item?.comment || '').trim(),
            nextDate,
            daysLeft,
          }
        })
        .filter(Boolean)
    })
    .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())
}

const ClientEventsContent = () => {
  const { data: clients = [] } = useClientsQuery()
  const modalsFunc = useAtomValue(modalsFuncAtom)

  const clientEvents = useMemo(() => buildClientEvents(clients), [clients])

  return (
    <div className="flex h-full flex-col">
      <ContentHeader>
        <HeaderActions
          left={<div />}
          right={<MutedText>Событий: {clientEvents.length}</MutedText>}
        />
      </ContentHeader>

      <SectionCard className="min-h-0 flex-1 overflow-auto p-2">
        {clientEvents.length > 0 ? (
          <div className="grid gap-2">
            {clientEvents.map((item) => {
              const clientName = getPersonFullName(item.client, {
                fallback: 'Без имени',
              })

              return (
                <button
                  key={`${item.client?._id}-${item.title}-${item.nextDate.toISOString()}`}
                  type="button"
                  className="flex cursor-pointer flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 text-left transition hover:border-gray-300 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => modalsFunc.client?.view(item.client?._id)}
                >
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-gray-900">
                      {item.title}
                    </div>
                    <div className="truncate text-sm font-medium text-gray-700">
                      {clientName}
                    </div>
                    {item.comment && (
                      <div className="mt-1 line-clamp-2 text-sm text-gray-600">
                        {item.comment}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <div className="text-sm font-semibold text-gray-900">
                      {formatDate(item.nextDate)}
                    </div>
                    <div className="text-xs font-medium text-gray-500">
                      {formatDaysLeft(item.daysLeft)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <EmptyState text="У клиентов пока нет значимых дат" bordered={false} />
        )}
      </SectionCard>
    </div>
  )
}

export default ClientEventsContent
