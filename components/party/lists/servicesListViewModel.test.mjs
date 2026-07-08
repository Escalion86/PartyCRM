import test from 'node:test'
import assert from 'node:assert/strict'

import { buildServicesListViewModel } from './servicesListViewModel.js'

test('renders flat services list when only default no-group bucket exists', () => {
  const result = buildServicesListViewModel({
    services: [
      { _id: 'service-b', title: 'Шоу мыльных пузырей' },
      { _id: 'service-a', title: 'Аниматор' },
    ],
    serviceGroups: [{ _id: 'default', title: 'Без группы', order: 0 }],
  })

  assert.equal(result.isGrouped, false)
  assert.deepEqual(
    result.flatList.map((service) => service._id),
    ['service-a', 'service-b']
  )
})
