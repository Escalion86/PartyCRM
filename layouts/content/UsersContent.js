'use client'

import { useMemo, useState } from 'react'
import ContentHeader from '@components/ContentHeader'
import AddIconButton from '@components/AddIconButton'
import EmptyState from '@components/EmptyState'
import HeaderActions from '@components/HeaderActions'
import Input from '@components/Input'
import MutedText from '@components/MutedText'
import SectionCard from '@components/SectionCard'
import UsersList from '@layouts/lists/UsersList'
import { modalsFuncAtom } from '@state/atoms'
import { useAtomValue } from 'jotai'
import { useUsersQuery } from '@helpers/useEntityQueries'

const UsersContent = () => {
  const { data: users = [] } = useUsersQuery()
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const [search, setSearch] = useState('')

  const filteredUsers = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase()
    return [...users]
      .filter((user) => {
        if (!lowerSearch) return true
        return [
          user.firstName,
          user.secondName,
          user.thirdName,
          user.phone ? `+${user.phone}` : '',
          user.telegram ? `@${user.telegram}` : '',
          user.email,
        ]
          .join(' ')
          .toLowerCase()
          .includes(lowerSearch)
      })
      .sort((a, b) => {
        const lastNameCompare = (a.secondName || '').localeCompare(
          b.secondName || '',
          'ru'
        )
        if (lastNameCompare !== 0) return lastNameCompare
        return (a.firstName || '').localeCompare(b.firstName || '', 'ru')
      })
  }, [search, users])

  return (
    <div className="flex flex-col h-full gap-4">
      <ContentHeader>
        <HeaderActions
          left={<div />}
          right={
            <>
              <MutedText>Всего: {users.length}</MutedText>
              <AddIconButton
                onClick={() => modalsFunc.user?.add()}
                disabled={!modalsFunc.user?.add}
                title="Добавить пользователя"
                size="sm"
                variant="neutral"
              />
            </>
          }
        />
      </ContentHeader>
      <div className="p-2">
        <Input
          label="Поиск пользователя"
          value={search}
          onChange={setSearch}
          placeholder="Введите имя, телефон или контакт"
          noMargin
        />
      </div>
      <SectionCard className="flex-1 min-h-0 overflow-hidden">
        {filteredUsers.length > 0 ? (
          <UsersList users={filteredUsers} />
        ) : (
          <EmptyState text="Пользователи не найдены" bordered={false} />
        )}
      </SectionCard>
    </div>
  )
}

export default UsersContent
