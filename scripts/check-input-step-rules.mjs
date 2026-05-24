import { readFile } from 'node:fs/promises'
import path from 'node:path'

const read = (file) => readFile(path.join(process.cwd(), file), 'utf8')

const inputSource = await read('components/Input.js')
const priceInputSource = await read('components/PriceInput.js')
const settingsSource = await read('layouts/content/SettingsContent.js')
const serviceFuncSource = await read('layouts/modals/modalsFunc/serviceFunc.js')
const partyServiceModalSource = await read(
  'components/party/modals/ServiceModal.js'
)
const partyTariffsAdminSource = await read('app/party/tariffs/PartyTariffsAdmin.js')

const requiredChecks = [
  [
    inputSource,
    'const resolvedStep =',
    'components/Input.js must compute resolvedStep',
  ],
  [
    inputSource,
    "postfix === '₽'",
    'components/Input.js must recognize money fields',
  ],
  [
    inputSource,
    "label?.toLowerCase?.().includes('мин')",
    'components/Input.js must recognize minute duration fields',
  ],
  [
    priceInputSource,
    'step="1000"',
    'components/PriceInput.js ruble input must step by 1000',
  ],
  [
    settingsSource,
    'step={5}',
    'layouts/content/SettingsContent.js duration must step by 5',
  ],
  [
    serviceFuncSource,
    'step={5}',
    'layouts/modals/modalsFunc/serviceFunc.js duration must step by 5',
  ],
  [
    partyServiceModalSource,
    'step={5}',
    'components/party/modals/ServiceModal.js duration must step by 5',
  ],
  [
    partyTariffsAdminSource,
    'step={1000}',
    'app/party/tariffs/PartyTariffsAdmin.js tariff price must step by 1000',
  ],
]

for (const [source, marker, message] of requiredChecks) {
  if (!source.includes(marker)) {
    throw new Error(message)
  }
}

console.log('input step rule checks passed')
