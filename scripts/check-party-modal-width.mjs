import { readFile } from 'node:fs/promises'
import path from 'node:path'

const source = await readFile(
  path.join(process.cwd(), 'components/Modal.js'),
  'utf8'
)

const expectedFragment = "full: 'max-w-full md:max-w-[95vw] lg:max-w-[75vw]'"

if (!source.includes(expectedFragment)) {
  throw new Error(
    'components/Modal.js does not use ArtistCRM-like desktop width for size="full"'
  )
}

console.log('party modal width checks passed')
