/* eslint-disable react-hooks/exhaustive-deps */
import FormWrapper from '@components/FormWrapper'
import TextLine from '@components/TextLine'
import UserName from '@components/UserName'
import Button from '@components/Button'
import Input from '@components/Input'
import { getData } from '@helpers/CRUD'
import formatDate from '@helpers/formatDate'
import loggedUserActiveRoleSelector from '@state/selectors/loggedUserActiveRoleSelector'
import userSelector from '@state/selectors/userSelector'
import tariffsAtom from '@state/atoms/tariffsAtom'
import ValuePicker from '@components/ValuePicker/ValuePicker'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import cn from 'classnames'
import { useEffect, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import useSnackbar from '@helpers/useSnackbar'

const userBillingFunc = (userId) => {
  const UserBillingModal = ({ closeModal }) => {
    const loggedUserActiveRole = useAtomValue(loggedUserActiveRoleSelector)
    const canManageUsers = loggedUserActiveRole?.users?.setRole
    const user = useAtomValue(userSelector(userId))
    const tariffs = useAtomValue(tariffsAtom)
    const modalsFunc = useAtomValue(modalsFuncAtom)
    const snackbar = useSnackbar()

    const [payments, setPayments] = useState([])
    const [isPaymentsLoading, setIsPaymentsLoading] = useState(false)
    const [syncingPaymentId, setSyncingPaymentId] = useState('')
    const [typeFilter, setTypeFilter] = useState('all')
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')

    useEffect(() => {
      if (!user) closeModal()
    }, [user])

    const formattedBalance = useMemo(() => {
      const value = Number(user?.balance ?? 0)
      if (!Number.isFinite(value)) return '0'
      return value.toLocaleString('ru-RU')
    }, [user?.balance])

    const currentTariff = useMemo(() => {
      if (!user?.tariffId) return null
      return tariffs.find((item) => String(item?._id) === String(user.tariffId))
    }, [tariffs, user?.tariffId])

    const formattedTariffUntil = useMemo(() => {
      if (!user?.tariffActiveUntil) return 'Без ограничений'
      return formatDate(user.tariffActiveUntil)
    }, [user?.tariffActiveUntil])

    const paymentTypeLabel = (type) => {
      if (type === 'topup') return 'Пополнение'
      if (type === 'charge') return 'Списание'
      if (type === 'refund') return 'Возврат'
      return 'Операция'
    }

    const paymentStatusLabel = (status) => {
      if (status === 'pending') return 'Ожидает подтверждения'
      if (status === 'canceled') return 'Отменен'
      if (status === 'failed') return 'Ошибка'
      return 'Проведен'
    }

    const filteredPayments = useMemo(() => {
      const startDate = fromDate ? new Date(fromDate) : null
      if (startDate) startDate.setHours(0, 0, 0, 0)
      const endDate = toDate ? new Date(toDate) : null
      if (endDate) endDate.setHours(23, 59, 59, 999)

      return payments.filter((payment) => {
        if (typeFilter !== 'all' && payment.type !== typeFilter) return false
        if (startDate || endDate) {
          const createdAt = new Date(payment.createdAt)
          if (startDate && createdAt < startDate) return false
          if (endDate && createdAt > endDate) return false
        }
        return true
      })
    }, [payments, typeFilter, fromDate, toDate])

    const loadPayments = async () => {
      if (!user?._id || !canManageUsers) return
      setIsPaymentsLoading(true)
      const data = await getData('/api/payments', { userId: user._id })
      setPayments(Array.isArray(data) ? data : [])
      setIsPaymentsLoading(false)
    }

    const syncPayment = async (payment) => {
      const paymentId = payment?._id
      if (!paymentId) return
      const provider = payment.source === 'tochka' ? 'tochka' : 'yookassa'
      setSyncingPaymentId(paymentId)
      try {
        const response = await fetch(`/api/billing/${provider}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload?.success) {
          snackbar.error(payload?.error || 'Не удалось синхронизировать платеж')
          return
        }
        snackbar.success('Платеж синхронизирован')
        await loadPayments()
      } finally {
        setSyncingPaymentId('')
      }
    }

    useEffect(() => {
      loadPayments()
    }, [user?._id, canManageUsers])

    if (!user) return null
    if (!canManageUsers) {
      return (
        <FormWrapper>
          <div className="text-sm text-gray-500">
            Доступно только администраторам
          </div>
        </FormWrapper>
      )
    }

    return (
      <FormWrapper flex className="flex-col gap-4">
        <div className="flex flex-col gap-1 pb-2">
          <UserName user={user} className="text-lg font-bold" />
          <TextLine label="Баланс">{formattedBalance} руб.</TextLine>
          <TextLine label="Тариф">
            {currentTariff?.title || 'Не выбран'}
          </TextLine>
          <TextLine label="Активен до">{formattedTariffUntil}</TextLine>
        </div>
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-800">
              История платежей
            </div>
            <Button
              name="Пополнить"
              className="h-9 px-4 text-sm"
              onClick={() => modalsFunc.user?.topup(user._id, loadPayments)}
            />
          </div>
          <div className="mt-2 grid gap-2">
            <ValuePicker
              label="Тип"
              value={typeFilter}
              onChange={setTypeFilter}
              valuesArray={[
                { value: 'all', name: 'Все' },
                { value: 'topup', name: 'Пополнение' },
                { value: 'charge', name: 'Списание' },
                { value: 'refund', name: 'Возврат' },
              ]}
              name="paymentsType"
            />
            <FormWrapper twoColumns>
              <Input
                label="С даты"
                type="date"
                value={fromDate}
                onChange={setFromDate}
              />
              <Input
                label="По дату"
                type="date"
                value={toDate}
                onChange={setToDate}
              />
            </FormWrapper>
          </div>
          {isPaymentsLoading ? (
            <div className="mt-2 text-sm text-gray-500">Загрузка...</div>
          ) : filteredPayments.length > 0 ? (
            <div className="mt-2 grid gap-2 text-sm">
              {filteredPayments.map((payment) => (
                <div
                  key={payment._id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                >
                  <div>
                    <div className="font-semibold text-gray-800">
                      {paymentTypeLabel(payment.type)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(payment.createdAt)}{' '}
                      {payment.comment ? `• ${payment.comment}` : ''}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Статус: {paymentStatusLabel(payment.status)}
                      {payment.source ? ` • ${payment.source}` : ''}
                      {payment.paymentMethodTitle
                        ? ` • ${payment.paymentMethodTitle}`
                        : ''}
                    </div>
                    {['yookassa', 'tochka'].includes(payment.source) &&
                    payment.status === 'pending' ? (
                      <button
                        type="button"
                        className="mt-1 cursor-pointer text-xs font-semibold text-general hover:underline"
                        disabled={syncingPaymentId === payment._id}
                        onClick={() => syncPayment(payment)}
                      >
                        {syncingPaymentId === payment._id
                          ? 'Синхронизация...'
                          : `Синхронизировать с ${
                              payment.source === 'tochka' ? 'Точкой' : 'ЮKassa'
                            }`}
                      </button>
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      'text-sm font-semibold',
                      payment.status === 'pending'
                        ? 'text-gray-500'
                        : payment.status === 'failed' ||
                            payment.status === 'canceled'
                          ? 'text-red-600'
                          : payment.type === 'charge'
                        ? 'text-red-600'
                        : 'text-green-600'
                    )}
                  >
                    {Number(payment.amount ?? 0).toLocaleString('ru-RU')} руб.
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-gray-500">Платежей нет</div>
          )}
        </div>
      </FormWrapper>
    )
  }

  return {
    title: 'Баланс и платежи',
    declineButtonName: 'Закрыть',
    closeButtonShow: true,
    Children: UserBillingModal,
  }
}

export default userBillingFunc

