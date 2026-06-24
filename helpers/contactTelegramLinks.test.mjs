import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('contacts Telegram buttons use Telegram app deep links only', async () => {
  const source = await readFile('components/ContactsIconsButtons.js', 'utf8')

  assert.match(source, /tg:\/\/resolve\?domain=\$\{user\.telegram\}/)
  assert.match(source, /tg:\/\/resolve\?phone=\$\{user\.phone\}/)
  assert.doesNotMatch(source, /https:\/\/t\.me/)
})
