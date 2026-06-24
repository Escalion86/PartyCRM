import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('performer workspace exposes calendar export link', async () => {
  const component = await source('app/performer/PerformerWorkspaceClient.js')

  assert.match(component, /\/api\/party\/performer\/calendar/)
  assert.match(component, /Скачать календарь/)
  assert.match(component, /download="partycrm-performer-calendar\.ics"/)
})
