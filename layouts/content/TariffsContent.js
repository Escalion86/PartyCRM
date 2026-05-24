'use client'

import ContentHeader from '@components/ContentHeader'
import AddIconButton from '@components/AddIconButton'
import EmptyState from '@components/EmptyState'
import HeaderActions from '@components/HeaderActions'
import MutedText from '@components/MutedText'
import SectionCard from '@components/SectionCard'
import TariffCard from '@layouts/cards/TariffCard'
import { modalsFuncAtom } from '@state/atoms'
import loggedUserActiveRoleSelector from '@state/selectors/loggedUserActiveRoleSelector'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { useAtomValue } from 'jotai'

const TariffsContent = () => {
  const tariffs = useAtomValue(tariffsAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const loggedUserActiveRole = useAtomValue(loggedUserActiveRoleSelector)
  const canEdit =
    loggedUserActiveRole?.dev || loggedUserActiveRole?.users?.setRole

  const sortedTariffs = [...tariffs].sort((a, b) => {
    const priceDiff = (a.price ?? 0) - (b.price ?? 0)
    if (priceDiff !== 0) return priceDiff
    return (a.title || '').localeCompare(b.title || '', 'ru')
  })

  if (!canEdit) {
    return (
      <div className="flex flex-col h-full gap-4">
        <ContentHeader />
        <SectionCard className="flex flex-1 min-h-0 items-center justify-center">
          <EmptyState text="Доступно только администраторам" bordered={false} />
        </SectionCard>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <ContentHeader>
        <HeaderActions
          left={<div />}
          right={
            <>
              <MutedText>Всего: {tariffs.length}</MutedText>
              <AddIconButton
                onClick={() => modalsFunc.tariff?.add()}
                disabled={!modalsFunc.tariff?.add}
                title="Добавить тариф"
                size="sm"
                variant="neutral"
              />
            </>
          }
        />
      </ContentHeader>
      <SectionCard className="flex-1 min-h-0 overflow-y-auto">
        {sortedTariffs.length > 0 ? (
          <div className="flex flex-col gap-3">
            {sortedTariffs.map((tariff) => (
              <TariffCard
                key={tariff._id}
                tariff={tariff}
                onEdit={() => modalsFunc.tariff?.edit(tariff._id)}
                onDelete={() => modalsFunc.tariff?.delete(tariff._id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState text="Тарифы не настроены" bordered={false} />
        )}
      </SectionCard>
    </div>
  )
}

export default TariffsContent
