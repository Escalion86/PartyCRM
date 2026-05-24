'use client'

import { useMemo, useCallback } from 'react'
import { List } from 'react-window'
import ContentHeader from '@components/ContentHeader'
import AddIconButton from '@components/AddIconButton'
import EmptyState from '@components/EmptyState'
import HeaderActions from '@components/HeaderActions'
import MutedText from '@components/MutedText'
import SectionCard from '@components/SectionCard'
import ServiceCard from '@layouts/cards/ServiceCard'
import { modalsFuncAtom } from '@state/atoms'
import { useAtomValue } from 'jotai'
import useUiDensity from '@helpers/useUiDensity'
import { useServicesQuery } from '@helpers/useEntityQueries'

const ServicesContent = () => {
  const { isCompact } = useUiDensity()
  const { data: services = [] } = useServicesQuery()
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const itemHeight = isCompact ? 138 : 160

  const sortedServices = useMemo(
    () =>
      [...services].sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', 'ru')
      ),
    [services]
  )

  const RowComponent = useCallback(
    ({ index, style }) => {
      const service = sortedServices[index]
      return <ServiceCard style={style} service={service} />
    },
    [sortedServices]
  )

  return (
    <div className="flex h-full flex-col gap-4">
      <ContentHeader>
        <HeaderActions
          left={<div />}
          right={
            <>
              <MutedText>Всего: {services.length}</MutedText>
              <AddIconButton
                onClick={() => modalsFunc.service?.add()}
                disabled={!modalsFunc.service?.add}
                title="Добавить услугу"
                size="sm"
                variant="neutral"
              />
            </>
          }
        />
      </ContentHeader>
      <SectionCard className="min-h-0 flex-1 overflow-hidden">
        {sortedServices.length > 0 ? (
          <List
            rowCount={sortedServices.length}
            rowHeight={itemHeight}
            rowComponent={RowComponent}
            rowProps={{}}
            style={{ height: '100%', width: '100%' }}
          />
        ) : (
          <EmptyState text="Услуги не найдены" bordered={false} />
        )}
      </SectionCard>
    </div>
  )
}

export default ServicesContent
