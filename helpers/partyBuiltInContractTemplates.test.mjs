import assert from 'node:assert/strict'
import test from 'node:test'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'

import {
  buildPartyBuiltInContractTemplateBuffer,
  PARTY_BUILT_IN_CONTRACT_TEMPLATES,
} from './partyBuiltInContractTemplates.js'
import { getPartyContractTemplateVariablesMap } from './partyGenerateContractTemplate.js'

test('built-in contract samples render with the order substitution engine', async () => {
  const orderValues = getPartyContractTemplateVariablesMap({
    order: {
      _id: 'aaaaaaaaaaaa',
      eventDate: '2026-12-04T03:00:00.000Z',
      contractAmount: 7800,
      placeType: 'client_address',
      clientAddress: { town: 'Красноярск', street: 'Мира', house: '32' },
    },
    client: { legalName: 'ООО «Проект»' },
    serviceTitles: ['Проведение игры', 'Дополнительное оборудование'],
    companyRequisites: { providerDisplayName: 'ИП Соколова', defaultTown: 'Красноярск' },
    docMeta: { documentNumber: 'А-380', contractDate: '2026-11-28', requisitesSidesMode: 'docx' },
  })
  const filled = {}
  for (const sample of PARTY_BUILT_IN_CONTRACT_TEMPLATES) {
    const content = await buildPartyBuiltInContractTemplateBuffer(sample.id)
    assert.ok(Buffer.isBuffer(content))
    const document = new Docxtemplater(new PizZip(content), {
      paragraphLoop: true,
      linebreaks: true,
      parser: (key) => ({
        get: () => {
          const normalized = key.replaceAll('_', ' ')
          assert.ok(Object.hasOwn(orderValues, normalized), `Unsupported field ${key}`)
          return orderValues[normalized]
        },
      }),
    })

    const source = document.getFullText()
    assert.match(source, /\{НОМЕР_ДОКУМЕНТА\}/)
    assert.match(source, /\{РЕКВИЗИТЫ_СТОРОН\}/)
    assert.match(source, /\{ПОДПИСИ_СТОРОН\}/)

    document.render()
    const ready = document.getFullText()
    assert.match(ready, /А-380/)
    assert.match(ready, /28\.11\.2026/)
    assert.match(ready, /ИП Соколова/)
    assert.match(ready, /ООО «Проект»/)
    assert.match(ready, /Мира/)
    assert.match(ready, /Проведение игры, Дополнительное оборудование/)
    assert.match(ready, /7\s?800 \(семь тысяч восемьсот\)/)
    assert.match(ready, /\[\[PARTIES_TABLES:/)
    assert.match(ready, /\[\[SIGNATURES_TABLE:/)
    assert.doesNotMatch(ready, /\{[А-ЯЁ_]+\}/)
    filled[sample.id] = ready
  }

  assert.match(filled.standard, /Приёмка, изменения и перенос/)
  assert.ok(filled.short.length < filled.standard.length)
  assert.match(filled.offsite, /Доступ и подготовка площадки/)
  assert.equal(await buildPartyBuiltInContractTemplateBuffer('unknown'), null)
})
