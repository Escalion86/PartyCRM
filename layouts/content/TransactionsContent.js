'use client'

import { useMemo, useCallback, useState } from 'react'
import { List } from 'react-window'
import ContentHeader from '@components/ContentHeader'
import AddIconButton from '@components/AddIconButton'
import EmptyState from '@components/EmptyState'
import HeaderActions from '@components/HeaderActions'
import TransactionTypeToggleButtons from '@components/IconToggleButtons/TransactionTypeToggleButtons'
import MutedText from '@components/MutedText'
import SectionCard from '@components/SectionCard'
import TransactionCard from '@layouts/cards/TransactionCard'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import { TRANSACTION_TYPES } from '@helpers/constants'
import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import { setAtomValue } from '@state/storeHelpers'
import useUiDensity from '@helpers/useUiDensity'
import {
  useDeleteTransactionMutation,
  useTransactionsQuery,
} from '@helpers/useTransactionsQuery'
import { useClientsQuery } from '@helpers/useClientsQuery'
import { useEventsQuery } from '@helpers/useEventsQuery'

const TransactionsContent = () => {
  const { isCompact } = useUiDensity()
  const { data: transactions = [] } = useTransactionsQuery()
  const deleteTransactionMutation = useDeleteTransactionMutation()
  const { data: clients = [] } = useClientsQuery()
  const { data: eventsPayload } = useEventsQuery({
    scope: 'all',
    enabled: false,
  })
  const events = useMemo(() => eventsPayload?.data ?? [], [eventsPayload?.data])
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const [typeFilter, setTypeFilter] = useState({
    income: true,
    expense: true,
  })
  const itemHeight = isCompact ? 106 : 120

  const typeMap = useMemo(
    () =>
      TRANSACTION_TYPES.reduce((acc, item) => {
        acc[item.value] = item
        return acc
      }, {}),
    []
  )

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

  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0
        const dateB = b.date ? new Date(b.date).getTime() : 0
        return dateB - dateA
      }),
    [transactions]
  )

  const filteredTransactions = useMemo(() => {
    if (typeFilter.income && typeFilter.expense) return sortedTransactions
    if (typeFilter.income)
      return sortedTransactions.filter((item) => item.type === 'income')
    if (typeFilter.expense)
      return sortedTransactions.filter((item) => item.type === 'expense')
    return sortedTransactions
  }, [sortedTransactions, typeFilter])

  const handleDelete = useCallback(
    (transactionId) => {
      modalsFunc.confirm({
        title: 'Удаление транзакции',
        text: 'Вы уверены, что хотите удалить транзакцию?',
        onConfirm: async () => {
          setAtomValue(loadingAtom('transaction' + transactionId), true)
          setAtomValue(errorAtom('transaction' + transactionId), false)
          try {
            await deleteTransactionMutation.mutateAsync(transactionId)
            setAtomValue(loadingAtom('transaction' + transactionId), false)
          } catch (error) {
            setAtomValue(loadingAtom('transaction' + transactionId), false)
            setAtomValue(errorAtom('transaction' + transactionId), true)
          }
        },
      })
    },
    [deleteTransactionMutation, modalsFunc]
  )

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
          onDelete={() => handleDelete(transaction._id)}
        />
      )
    },
    [
      filteredTransactions,
      clientsMap,
      eventsMap,
      typeMap,
      modalsFunc.transaction,
      handleDelete,
    ]
  )

  return (
    <div className="flex h-full flex-col gap-4">
      <ContentHeader>
        <HeaderActions
          left={
            <TransactionTypeToggleButtons
              value={typeFilter}
              onChange={setTypeFilter}
            />
          }
          leftClassName="flex-wrap"
          right={
            <>
              <MutedText>
                {filteredTransactions.length} из {transactions.length}
              </MutedText>
              <AddIconButton
                onClick={() => modalsFunc.transaction?.add()}
                disabled={!modalsFunc.transaction?.add}
                title="Добавить транзакцию"
                size="sm"
                variant="neutral"
              />
            </>
          }
        />
      </ContentHeader>
      <SectionCard className="min-h-0 flex-1 overflow-hidden border-0 bg-transparent shadow-none">
        {filteredTransactions.length > 0 ? (
          <List
            rowCount={filteredTransactions.length}
            rowHeight={itemHeight}
            rowComponent={RowComponent}
            rowProps={{}}
                                    style={{ height: '100%', width: '100%' }}
          />
        ) : (
          <EmptyState text="Транзакций пока нет" />
        )}
      </SectionCard>
    </div>
  )
}

export default TransactionsContent
