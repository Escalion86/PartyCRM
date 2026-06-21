import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const globalsCss = readFileSync(
  join(process.cwd(), 'app', 'globals.css'),
  'utf8'
)

test('action-icon-button keeps fixed height and flexible minimum width', () => {
  assert.doesNotMatch(
    globalsCss,
    /^\s*inline-size:\s*var\(--action-icon-button-size\)\s*!important;/m
  )
  assert.match(
    globalsCss,
    /block-size:\s*var\(--action-icon-button-size\)\s*!important;/
  )
  assert.match(
    globalsCss,
    /min-inline-size:\s*var\(--action-icon-button-size\)\s*!important;/
  )
  assert.doesNotMatch(
    globalsCss,
    /^\s*max-inline-size:\s*var\(--action-icon-button-size\)\s*!important;/m
  )
  assert.doesNotMatch(globalsCss, /padding-inline:\s*0\s*!important;/)
})

test('action-icon-button maps existing height and min-width utilities to sizes', () => {
  assert.match(
    globalsCss,
    /\.action-icon-button\.h-8,\s*\.action-icon-button\.min-w-8\s*{\s*--action-icon-button-size:\s*2rem;\s*}/s
  )
  assert.match(
    globalsCss,
    /\.action-icon-button\.h-9,\s*\.action-icon-button\.min-w-9\s*{\s*--action-icon-button-size:\s*2\.25rem;\s*}/s
  )
  assert.match(
    globalsCss,
    /\.action-icon-button\.h-10,\s*\.action-icon-button\.min-w-10\s*{\s*--action-icon-button-size:\s*2\.5rem;\s*}/s
  )
  assert.match(
    globalsCss,
    /\.action-icon-button\.h-11,\s*\.action-icon-button\.min-w-11\s*{\s*--action-icon-button-size:\s*2\.75rem;\s*}/s
  )
  assert.match(
    globalsCss,
    /\.action-icon-button\.h-12,\s*\.action-icon-button\.min-w-12\s*{\s*--action-icon-button-size:\s*3rem;\s*}/s
  )
  assert.match(
    globalsCss,
    /\.action-icon-button\.h-14,\s*\.action-icon-button\.min-w-14\s*{\s*--action-icon-button-size:\s*3\.5rem;\s*}/s
  )
})
