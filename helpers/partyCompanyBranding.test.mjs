import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PARTY_COMPANY_PALETTES,
  DEFAULT_PARTY_COMPANY_BRANDING,
  normalizePartyCompanyLogoUrl,
  normalizePartyCompanyBranding,
  validatePartyCompanyBranding,
} from './partyCompanyBranding.js'
import { mergeCompanySettingsPatch } from './companySettings.js'
import { serializePartyMembershipCompany } from '../server/partyMembershipResponse.js'

test('legacy companies receive the default theme and partial patches preserve the logo', () => {
  assert.deepEqual(normalizePartyCompanyBranding(), DEFAULT_PARTY_COMPANY_BRANDING)
  const current = { branding: { palette: 'rose', logoUrl: '/logo.png' } }
  assert.deepEqual(mergeCompanySettingsPatch(current, { branding: { palette: 'emerald' } }).branding, { palette: 'emerald', logoUrl: '/logo.png' })
  assert.deepEqual(mergeCompanySettingsPatch(current, { defaultTown: 'Москва' }).branding, current.branding)
})

test('only supported raster logo links without credentials or network targets are accepted', () => {
  assert.equal(normalizePartyCompanyLogoUrl(' https://cdn.example.ru/logo.PNG?v=2 '), 'https://cdn.example.ru/logo.PNG?v=2')
  assert.equal(normalizePartyCompanyLogoUrl('/images/logo.webp'), '/images/logo.webp')
  for (const url of [
    'http://example.ru/logo.png', '//example.ru/logo.png', 'javascript:alert(1)',
    'data:image/png;base64,AAAA', 'https://user:pass@example.ru/logo.png',
    'https://localhost/logo.png', 'https://127.0.0.1/logo.png',
    'https://0x7f000001/logo.png', 'https://[::1]/logo.png',
    'https://router.local/logo.png', 'https://example.ru:444/logo.png',
    'https://example.ru/logo.svg', 'https://example.ru/logo.png#anchor',
    '/\\example.ru/logo.png', '/logo.png\nhttps://example.ru',
  ]) assert.equal(normalizePartyCompanyLogoUrl(url), '', url)
})

test('branding patches reject unknown fields, arbitrary colors and non-string URLs', () => {
  for (const value of [null, [], '', { palette: 'custom' }, { accent: '#fff' }, { logoUrl: 5 }, { logoUrl: 'https://localhost/logo.png' }]) assert.ok(validatePartyCompanyBranding(value))
  assert.equal(validatePartyCompanyBranding({ palette: 'amber', logoUrl: '' }), '')
  assert.equal(validatePartyCompanyBranding({ logoUrl: '/logo.png' }), '')
})

test('every palette keeps text readable on action, pale and dark navigation surfaces', () => {
  const luminance = (hex) => {
    const values = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
  }
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
  for (const palette of PARTY_COMPANY_PALETTES) {
    for (const [fg, bg] of [['#ffffff', palette.accent], ['#ffffff', palette.hover], [palette.accent, '#ffffff'], [palette.ink, palette.soft], [palette.light, '#020617']])
      assert.ok(contrast(fg, bg) >= 4.5, `${palette.id} ${fg} on ${bg}`)
  }
})

test('staff can receive the safe visual theme without receiving secret settings', () => {
  const company = { title: 'Компания', settings: { branding: { palette: 'violet', logoUrl: '/logo.png', secret: 'hidden' }, integrations: { token: 'hidden' } } }
  for (const role of ['owner', 'admin', 'performer', 'location_owner']) {
    const response = serializePartyMembershipCompany(company, role)
    assert.deepEqual(response.settings.branding, { palette: 'violet', logoUrl: '/logo.png' })
    assert.equal(JSON.stringify(response).includes('hidden'), false)
  }
})
