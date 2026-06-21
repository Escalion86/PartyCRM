import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const readSource = (filePath) =>
  existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''

const actionIconButtonSource = readSource(
  join(process.cwd(), 'components', 'ActionIconButton.js')
)
const iconActionButtonSource = readFileSync(
  join(process.cwd(), 'components', 'IconActionButton.js'),
  'utf8'
)

test('ActionIconButton exposes semantic sizes with minimum width classes', () => {
  assert.notEqual(actionIconButtonSource, '')

  for (const [size, className] of [
    ['xs', 'h-8 min-w-8'],
    ['sm', 'h-9 min-w-9'],
    ['base', 'h-10 min-w-10'],
    ['md', 'h-11 min-w-11'],
    ['lg', 'h-12 min-w-12'],
    ['xl', 'h-14 min-w-14'],
  ]) {
    assert.match(
      actionIconButtonSource,
      new RegExp(`${size}: '${className}'`)
    )
  }

  assert.doesNotMatch(actionIconButtonSource, /\bh-\d+\s+w-\d+\b/)
})

test('IconActionButton composes the base ActionIconButton component', () => {
  assert.match(iconActionButtonSource, /import ActionIconButton from/)
  assert.match(iconActionButtonSource, /<ActionIconButton[\s\S]*size=\{size\}/)
  assert.match(
    iconActionButtonSource,
    /size:\s*PropTypes\.oneOf\(\[\s*'xs',\s*'sm',\s*'base',\s*'md',\s*'lg',\s*'xl'\s*\]\)/
  )
})
