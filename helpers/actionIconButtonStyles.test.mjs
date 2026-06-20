import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const globalsCss = readFileSync(
  join(process.cwd(), 'app', 'globals.css'),
  'utf8'
)

test('action-icon-button keeps a square shape from its base styles', () => {
  assert.match(
    globalsCss,
    /inline-size:\s*var\(--action-icon-button-size\)\s*!important;/
  )
  assert.match(
    globalsCss,
    /block-size:\s*var\(--action-icon-button-size\)\s*!important;/
  )
  assert.match(globalsCss, /aspect-ratio:\s*1\s*\/\s*1;/)
  assert.match(globalsCss, /padding-inline:\s*0\s*!important;/)
})

test('action-icon-button maps existing size utilities to square sizes', () => {
  assert.match(
    globalsCss,
    /\.action-icon-button\.h-8,\s*\.action-icon-button\.w-8\s*{\s*--action-icon-button-size:\s*2rem;\s*}/s
  )
  assert.match(
    globalsCss,
    /\.action-icon-button\.h-9,\s*\.action-icon-button\.w-9\s*{\s*--action-icon-button-size:\s*2\.25rem;\s*}/s
  )
  assert.match(
    globalsCss,
    /\.action-icon-button\.h-10,\s*\.action-icon-button\.w-10\s*{\s*--action-icon-button-size:\s*2\.5rem;\s*}/s
  )
  assert.match(
    globalsCss,
    /\.action-icon-button\.h-12,\s*\.action-icon-button\.w-12\s*{\s*--action-icon-button-size:\s*3rem;\s*}/s
  )
})
