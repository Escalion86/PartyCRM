import test from 'node:test'
import assert from 'node:assert/strict'

import { getInitialCompanyTitle } from './companyMasterDefaults.js'

test('getInitialCompanyTitle returns default company title', () => {
  assert.equal(getInitialCompanyTitle(), 'Новая компания')
})
