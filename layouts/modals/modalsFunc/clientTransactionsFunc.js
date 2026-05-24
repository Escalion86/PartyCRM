/* eslint-disable react-hooks/exhaustive-deps */
import { useMemo, useState, useCallback } from 'react'
import { List } from 'react-window'
import TransactionTypeToggleButtons from '@components/IconToggleButtons/TransactionTypeToggleButtons'
import TransactionCard from '@layouts/cards/TransactionCard'
import { TRANSACTION_TYPES } from '@helpers/constants'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import { useClientRelationsQuery, useClientsQuery } from '@helpers/useClientsQuery'

const ITEM_HEIGHT = 120

const clientTransactionsFunc = (clientId) => {
  const ClientTransactionsModal = () => {
    const { data: clients = [] } = useClientsQuery()
    const modalsFunc = useAtomValue(modalsFuncAtom)
    const { data: relations } = useClientRelationsQuery(clientId)
    const transactions = relations?.transactions ?? []
    const events = relations?.events ?? []
    const [typeFilter, setTypeFilter] = useState({
      income: true,
      expense: true,
    })

    const clientsMap = useMemo(
      () =>
        clients.reduce((acc, client) => {
          acc[client._id] = client
          return acc
        }, {}),
      [clients]
    )

    const eventsMap = useMemo(
      () =>
        events.reduce((acc, event) => {
          acc[event._id] = event
          return acc
        }, {}),
      [events]
    )

    const typeMap = useMemo(
      () =>
        TRANSACTION_TYPES.reduce((acc, item) => {
          acc[item.value] = item
          return acc
        }, {}),
      []
    )

    const clientTransactions = useMemo(
      () =>
        (transactions ?? [])
          .filter((transaction) => transaction.clientId === clientId)
          .sort(
            (a, b) =>
              new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
          ),
      [transactions, clientId]
    )

    const filteredTransactions = useMemo(() => {
      if (typeFilter.income && typeFilter.expense) return clientTransactions
      if (typeFilter.income)
        return clientTransactions.filter((item) => item.type === 'income')
      if (typeFilter.expense)
        return clientTransactions.filter((item) => item.type === 'expense')
      return clientTransactions
    }, [clientTransactions, typeFilter])

    const RowComponent = useCallback(
      ({ index, style }) => {
        const transaction = filteredTransactions[index]
        const client = clientsMap[transaction.clientId]
        const event = eventsMap[transaction.eventId]
        const type = typeMap[transaction.type] ?? typeMap.expense
        const handleEdit = () =>
          modalsFunc.transaction?.edit(transaction.eventId, transaction._id)

        return (
          <TransactionCard
            style={style}
            transaction={transaction}
            client={client}
            event={event}
            type={type}
            onEdit={handleEdit}
            onDelete={() => {}}
          />
        )
      },
      [filteredTransactions, clientsMap, eventsMap, typeMap, modalsFunc]
    )

    return (
      <div className="flex h-full flex-col gap-3 tablet:h-[60vh]">
        <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
          <TransactionTypeToggleButtons
            value={typeFilter}
            onChange={setTypeFilter}
          />
          <span>
            {filteredTransactions.length} из {clientTransactions.length}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {filteredTransactions.length > 0 ? (
            <List
              rowCount={filteredTransactions.length}
              rowHeight={ITEM_HEIGHT}
              rowComponent={RowComponent}
              rowProps={{}}
              style={{ height: '100%', width: '100%' }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              Транзакций не найдено
            </div>
          )}
        </div>
      </div>
    )
  }

  return {
    title: 'Транзакции клиента',
    confirmButtonName: 'Закрыть',
    showDecline: false,
    onConfirm: true,
    Children: ClientTransactionsModal,
  }
}

export default clientTransactionsFunc

