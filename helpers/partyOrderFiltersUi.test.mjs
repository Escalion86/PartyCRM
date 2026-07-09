import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party orders filters use compact dropdown instead of full chip row', async () => {
  const component = await source('app/company/CompanyWorkspaceClient.js')

  assert.match(component, /import DropDown from '@components\/DropDown'/)
  assert.match(component, /const OrderFilterDropdown =/)
  assert.match(component, /Фильтр:/)
  assert.match(component, /orderFilters\.map\(\(filter\) =>/)
  assert.match(component, /selectedFilter\?\.label/)
  assert.match(component, /setOrderFilter\(filter\.value\)/)
  assert.match(component, /faCheck/)
  assert.match(component, /role="menuitemradio"/)
  assert.doesNotMatch(
    component,
    /<span className="text-sm text-black\/55">\s*\{filteredOrders\.length\}\s*<\/span>/
  )
  assert.doesNotMatch(component, /flex flex-wrap gap-2">\s*\{orderFilters\.map/)
})
