'use client'

import { useMemo, useState, useCallback } from 'react'
import { List } from 'react-window'
import ContentHeader from '@components/ContentHeader'
import AddIconButton from '@components/AddIconButton'
import EmptyState from '@components/EmptyState'
import HeaderActions from '@components/HeaderActions'
import Input from '@components/Input'
import MutedText from '@components/MutedText'
import SectionCard from '@components/SectionCard'
import ClientCard from '@layouts/cards/ClientCard'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import useUiDensity from '@helpers/useUiDensity'
import { useClientsQuery } from '@helpers/useClientsQuery'
import { useEventsQuery } from '@helpers/useEventsQuery'

const normalizeDigits = (value) =>
  String(value ?? '').replace(/[^\d]/g, '')

const ClientsContent = () => {
  const { isCompact } = useUiDensity()
  const { data: clients = [] } = useClientsQuery()
  const { data: eventsPayload } = useEventsQuery({
    scope: 'all',
    enabled: false,
  })
  const events = useMemo(() => eventsPayload?.data ?? [], [eventsPayload?.data])
  const modalsFunc = useAtomValue(modalsFuncAtom)

  const [search, setSearch] = useState('')
  const itemHeight = isCompact ? 122 : 140

  const clientsWithStats = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase()
    const digitsSearch = normalizeDigits(search)
    return clients
      .map((client) => {
        const clientRequests = events.filter(
          (event) => event.clientId === client._id && event.status === 'draft'
        )
        const clientEvents = events.filter(
          (event) => event.clientId === client._id && event.status !== 'draft'
        )
        const canceledEventsCount = clientEvents.filter(
          (event) => event.status === 'canceled'
        ).length
        const activeEventsCount = clientEvents.length - canceledEventsCount
        const lastRequest = clientRequests.reduce((latest, request) => {
          if (!request.eventDate) return latest
          const requestDate = new Date(request.eventDate)
          return !latest || requestDate > latest ? requestDate : latest
        }, null)
        return {
          ...client,
          requestsCount: clientRequests.length,
          eventsCount: activeEventsCount,
          canceledEventsCount,
          lastRequest,
        }
      })
      .filter((client) => {
        if (!lowerSearch) return true
        const textMatch = [
          client.firstName,
          client.secondName,
          client.thirdName,
          client.telegram,
          client.instagram,
          client.vk,
          client.phone ? `+${client.phone}` : '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(lowerSearch)

        if (textMatch) return true
        if (!digitsSearch) return false

        const contactsDigits = [
          client.phone,
          client.whatsapp,
          client.viber,
          client.telegram,
        ]
          .map(normalizeDigits)
          .filter(Boolean)
          .join(' ')

        return contactsDigits.includes(digitsSearch)
      })
      .sort((a, b) => {
        if (a.lastRequest && b.lastRequest)
          return b.lastRequest.getTime() - a.lastRequest.getTime()
        if (a.lastRequest) return -1
        if (b.lastRequest) return 1
        return (b.requestsCount || 0) - (a.requestsCount || 0)
      })
  }, [clients, events, search])

  const RowComponent = useCallback(
    ({ index, style }) => {
      const client = clientsWithStats[index]
      return (
        <ClientCard
          style={style}
          client={client}
          onEdit={() => modalsFunc.client?.edit(client._id)}
          onView={() => modalsFunc.client?.view(client._id)}
        />
      )
    },
    [clientsWithStats, modalsFunc.client]
  )

  return (
    <div className="flex flex-col h-full">
      <ContentHeader>
        <HeaderActions
          left={<div />}
          right={
            <>
              <MutedText>Всего: {clients.length}</MutedText>
              <AddIconButton
                onClick={() => modalsFunc.client?.add()}
                disabled={!modalsFunc.client?.add}
                title="Добавить клиента"
                size="sm"
                variant="neutral"
              />
            </>
          }
        />
      </ContentHeader>
      <div className="p-2">
        <Input
          label="Поиск клиента"
          value={search}
          onChange={setSearch}
          placeholder="Введите имя или телефон"
          noMargin
        />
      </div>
      <SectionCard className="flex-1 min-h-0 overflow-visible">
        {clientsWithStats.length > 0 ? (
          <List
            rowCount={clientsWithStats.length}
            rowHeight={itemHeight}
            rowComponent={RowComponent}
            rowProps={{}}
            style={{ height: '100%', width: '100%' }}
          />
        ) : (
          <EmptyState text="Клиенты не найдены" bordered={false} />
        )}
      </SectionCard>
    </div>
  )
}

export default ClientsContent
