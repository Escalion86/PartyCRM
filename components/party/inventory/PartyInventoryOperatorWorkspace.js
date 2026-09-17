'use client'

import { useState } from 'react'
import InventoryMovementsPanel from './InventoryMovementsPanel'

export default function PartyInventoryOperatorWorkspace({ companies = [] }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(
    companies[0]?.id || ''
  )
  const activeCompanyId = companies.some(
    (company) => company.id === selectedCompanyId
  )
    ? selectedCompanyId
    : companies[0]?.id || ''

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-4 p-3 sm:p-6">
      <h1 className="text-xl font-semibold">Выдача и возврат реквизита</h1>
      <p className="text-sm text-gray-600">
        Фиксируйте выдачу, передачу и возврат реквизита, его состояние и срок
        возврата.
      </p>
      {companies.length > 1 ? (
        <label className="block max-w-md text-sm font-medium">
          Компания
          <select
            className="mt-1 w-full cursor-pointer rounded border bg-white p-2"
            value={activeCompanyId}
            onChange={(event) => setSelectedCompanyId(event.target.value)}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.title}
              </option>
            ))}
          </select>
        </label>
      ) : companies[0] ? (
        <p className="text-sm font-medium">{companies[0].title}</p>
      ) : null}
      {activeCompanyId ? (
        <InventoryMovementsPanel
          key={activeCompanyId}
          activeCompanyId={activeCompanyId}
        />
      ) : (
        <p role="status">Нет компаний с доступом к выдаче реквизита.</p>
      )}
    </div>
  )
}
