import { readFile } from 'node:fs/promises'
import path from 'node:path'

const files = [
  'app/party/PartyPricingSection.js',
  'app/party/tariffs/PartyTariffsAdmin.js',
  'app/party/tariffs/page.js',
]

const mojibakePattern = /[╨╤]|тА|�|├Ч/

for (const relativePath of files) {
  const absolutePath = path.join(process.cwd(), relativePath)
  const source = await readFile(absolutePath, 'utf8')
  const match = source.match(mojibakePattern)
  if (match) {
    throw new Error(
      `${relativePath} contains mojibake marker "${match[0]}" at index ${match.index}`
    )
  }
}

console.log('party tariffs text checks passed')
