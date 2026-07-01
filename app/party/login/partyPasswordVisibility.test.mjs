import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const readSource = () =>
  readFile(join(process.cwd(), 'app/party/login/PartyLoginClient.js'), 'utf8')

test('party auth password fields expose visibility toggle buttons', async () => {
  const source = await readSource()

  assert.match(source, /showPasswordToggle/)
  assert.match(source, /passwordVisible/)
  assert.match(source, /passwordRepeatVisible/)
  assert.match(source, /aria-label=\{[\s\S]*passwordInputType === 'password'[\s\S]*'Показать пароль'[\s\S]*'Скрыть пароль'[\s\S]*\}/)
  assert.match(source, /onClick=\{onTogglePasswordVisibility\}/)
  assert.equal((source.match(/showPasswordToggle/g) || []).length, 5)
})
