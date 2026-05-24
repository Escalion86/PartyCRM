import { readFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()

const checks = [
  {
    file: 'app/robots.js',
    required: ['export default function robots()', 'sitemap.xml', 'host:'],
  },
  {
    file: 'helpers/seoLandingPages.js',
    required: [
      'export const seoLandingPages = {',
      'export const seoLandingSlugs = Object.keys(seoLandingPages)',
      'export const buildSeoLandingMetadata = (page) => {',
    ],
  },
]

for (const check of checks) {
  const source = await readFile(path.join(rootDir, check.file), 'utf8')

  if (source.includes('-NoNewline')) {
    throw new Error(`${check.file} is corrupted with "-NoNewline" content`)
  }

  for (const marker of check.required) {
    if (!source.includes(marker)) {
      throw new Error(`${check.file} is missing required marker: ${marker}`)
    }
  }
}

console.log('seo core file checks passed')
