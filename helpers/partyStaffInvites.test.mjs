import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PARTY_STAFF_INVITE_TTL_MS,
  buildPartyStaffInviteShareContent,
  buildPartyStaffInvitePublicView,
  createPartyStaffInviteToken,
  getPartyStaffInviteAcceptanceDecision,
  getPartyStaffInviteExpiry,
  hashPartyStaffInviteToken,
  isPartyStaffInviteRole,
} from './partyStaffInvites.js'

test('invite share content prepares copy text and manual delivery links', () => {
  const share = buildPartyStaffInviteShareContent({
    companyTitle: 'Праздник 24',
    staffName: 'Петров Иван',
    role: 'performer',
    inviteUrl: 'https://partycrm.ru/party/invite/token',
  })

  assert.match(share.text, /Праздник 24/)
  assert.match(share.text, /Петров Иван/)
  assert.match(share.text, /Исполнитель/)
  assert.match(share.text, /https:\/\/partycrm\.ru\/party\/invite\/token/)
  assert.match(share.smsUrl, /^sms:\?body=/)
  assert.match(share.emailUrl, /^mailto:\?subject=/)
  assert.match(share.telegramUrl, /^https:\/\/t\.me\/share\/url\?/)
  assert.match(share.whatsappUrl, /^https:\/\/wa\.me\/\?text=/)
})

test('invite token is random base64url and hash is deterministic sha256', () => {
  const first = createPartyStaffInviteToken()
  const second = createPartyStaffInviteToken()

  assert.match(first, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(first, second)
  assert.equal(hashPartyStaffInviteToken(first), hashPartyStaffInviteToken(first))
  assert.match(hashPartyStaffInviteToken(first), /^[a-f0-9]{64}$/)
})

test('invite expires seven days after creation', () => {
  const now = new Date('2026-06-13T00:00:00.000Z')
  assert.equal(
    getPartyStaffInviteExpiry(now).getTime(),
    now.getTime() + PARTY_STAFF_INVITE_TTL_MS
  )
})

test('only admin and performer roles can be invited', () => {
  assert.equal(isPartyStaffInviteRole('admin'), true)
  assert.equal(isPartyStaffInviteRole('performer'), true)
  assert.equal(isPartyStaffInviteRole('owner'), false)
})

test('public invite view masks phone and omits internal ids', () => {
  const view = buildPartyStaffInvitePublicView({
    invite: {
      status: 'active',
      role: 'performer',
      phone: '79991234567',
      expiresAt: '2026-06-20T00:00:00.000Z',
      tenantId: 'secret-company-id',
      staffId: 'secret-staff-id',
    },
    company: { title: 'Праздник' },
    staff: { firstName: 'Иван', secondName: 'Петров' },
  })

  assert.deepEqual(view, {
    status: 'active',
    role: 'performer',
    roleLabel: 'Исполнитель',
    maskedPhone: '+7 (***) ***-**-67',
    expiresAt: '2026-06-20T00:00:00.000Z',
    companyTitle: 'Праздник',
    staffName: 'Петров Иван',
  })
})

test('acceptance requires active invite and matching phone', () => {
  const base = {
    invite: { status: 'active', role: 'admin', phone: '79991234567' },
    sessionUser: { _id: 'user-1', phone: '79991234567' },
    staff: { authUserId: '', status: 'invited' },
    existingCompanyStaff: null,
  }

  assert.deepEqual(getPartyStaffInviteAcceptanceDecision(base), {
    ok: true,
    idempotent: false,
    interfaceRole: 'company',
    redirectTo: '/company',
  })

  assert.equal(
    getPartyStaffInviteAcceptanceDecision({
      ...base,
      sessionUser: { _id: 'user-1', phone: '79990000000' },
    }).code,
    'partycrm_invite_phone_mismatch'
  )
})

test('acceptance rejects an invite after staff phone or role changes', () => {
  const base = {
    invite: { status: 'active', role: 'performer', phone: '79991234567' },
    sessionUser: { _id: 'user-1', phone: '79991234567' },
    staff: {
      _id: 'staff-1',
      authUserId: '',
      status: 'invited',
      role: 'performer',
      phone: '79991234567',
    },
    existingCompanyStaff: null,
  }

  assert.equal(
    getPartyStaffInviteAcceptanceDecision({
      ...base,
      staff: { ...base.staff, role: 'admin' },
    }).code,
    'partycrm_invite_staff_changed'
  )
  assert.equal(
    getPartyStaffInviteAcceptanceDecision({
      ...base,
      staff: { ...base.staff, phone: '79990000000' },
    }).code,
    'partycrm_invite_staff_changed'
  )
})

test('acceptance rejects owner role and another membership in company', () => {
  const base = {
    invite: { status: 'active', role: 'owner', phone: '79991234567' },
    sessionUser: { _id: 'user-1', phone: '79991234567' },
    staff: { authUserId: '', status: 'invited' },
    existingCompanyStaff: null,
  }

  assert.equal(
    getPartyStaffInviteAcceptanceDecision(base).code,
    'partycrm_invite_role_invalid'
  )
  assert.equal(
    getPartyStaffInviteAcceptanceDecision({
      ...base,
      invite: { ...base.invite, role: 'performer' },
      existingCompanyStaff: { _id: 'other-staff' },
    }).code,
    'partycrm_invite_membership_exists'
  )
})

test('acceptance is idempotent when staff is already linked to current user', () => {
  const decision = getPartyStaffInviteAcceptanceDecision({
    invite: { status: 'accepted', role: 'performer', phone: '79991234567' },
    sessionUser: { _id: 'user-1', phone: '79991234567' },
    staff: { authUserId: 'user-1', status: 'active' },
    existingCompanyStaff: null,
  })

  assert.deepEqual(decision, {
    ok: true,
    idempotent: true,
    interfaceRole: 'performer',
    redirectTo: '/performer',
  })
})
