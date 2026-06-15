import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('PartyCRM public legal pages use the current identity, domain and date', async () => {
  const pages = await Promise.all([
    read('app/privacy/page.js'),
    read('app/terms/page.js'),
    read('app/personal-data-consent/page.js'),
  ])

  for (const source of pages) {
    assert.match(source, /15\.06\.2026/)
    assert.match(source, /PartyCRM/)
    assert.match(source, /partycrm\.ru/)
    assert.match(source, /245727560982/)
    assert.match(source, /319246800103511/)
    assert.doesNotMatch(source, /ArtistCRM|artistcrm/i)
  }
})

test('privacy policy fully discloses Google Calendar data use and controls', async () => {
  const source = await read('app/privacy/page.js')

  for (const fragment of [
    'Google Calendar',
    'адрес электронной почты',
    'OAuth',
    'токен',
    'список календарей',
    'создавать',
    'обновлять',
    'удалять',
    'выбранном календаре',
    'данные заказов',
    'не прода',
    'реклам',
    'Limited Use',
    'developers.google.com/terms/api-services-user-data-policy',
    'отключить интеграцию',
    'отозвать доступ',
    'удалени',
    'Escalion86@gmail.com',
  ]) {
    assert.ok(source.includes(fragment), `Missing privacy disclosure: ${fragment}`)
  }
})

test('privacy policy accurately discloses Yandex Metrica analytics', async () => {
  const source = await read('app/privacy/page.js')

  assert.doesNotMatch(source, /не использует аналитические системы/i)
  assert.match(source, /Яндекс Метрик/i)
  assert.match(source, /cookie/i)
  assert.match(source, /идентификатор/i)
  assert.match(source, /посещени/i)
  assert.match(source, /действи/i)
  assert.match(source, /Вебвизор|Webvisor/i)
  assert.match(source, /улучшени/i)
  assert.match(source, /yandex\.ru\/legal\/confidential/i)
  assert.match(source, /управлять cookies/i)
})

test('terms and consent link the current PartyCRM legal documents', async () => {
  const terms = await read('app/terms/page.js')
  const consent = await read('app/personal-data-consent/page.js')

  assert.match(terms, /href="\/privacy"/)
  assert.match(terms, /href="\/personal-data-consent"/)
  assert.match(consent, /href="\/privacy"/)
  assert.match(consent, /href="\/terms"/)
})

test('PartyCRM landing footer links all three legal documents', async () => {
  const source = await read('app/party/page.js')

  assert.match(source, /href="\/privacy"/)
  assert.match(source, /href="\/terms"/)
  assert.match(source, /href="\/personal-data-consent"/)
})
