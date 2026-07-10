import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getPartyUserModel } from '@server/partyModels'
import { createPartyGoogleCalendarClient } from '@server/partyGoogleCalendarClient'
import oauthState from '@server/partyGoogleCalendarOAuthState'
import { createPartyPerformerGoogleCalendarApiCore } from '@server/partyPerformerGoogleCalendarApiCore'
import {
  createGoogleCalendarAuthUrl,
  exchangeGoogleCalendarCode,
} from '../../google-calendar/_shared'

const {
  createPartyGoogleCalendarOAuthState,
  verifyPartyGoogleCalendarOAuthState,
} = oauthState

export const createPerformerCore = () =>
  createPartyPerformerGoogleCalendarApiCore({
    loadUser: async (id) => (await getPartyUserModel()).findById(id).lean(),
    saveGoogleCalendar: async (id, settings) =>
      (await getPartyUserModel()).updateOne(
        { _id: id },
        { $set: { 'performerSettings.googleCalendar': settings } }
      ),
    createClient: (settings, { onCredentials }) =>
      createPartyGoogleCalendarClient(settings, { onCredentials }),
    createState: createPartyGoogleCalendarOAuthState,
    verifyState: verifyPartyGoogleCalendarOAuthState,
    randomNonce: () => crypto.randomBytes(24).toString('base64url'),
    now: () => new Date(),
    createAuthUrl: createGoogleCalendarAuthUrl,
    exchangeCode: exchangeGoogleCalendarCode,
  })

export const authorizePerformerCallback = async ({ userId }) =>
  Boolean(
    await (await getPartyUserModel()).exists({
      _id: userId,
      status: 'active',
      interfaceRoles: 'performer',
    })
  )

export const jsonResult = (result) =>
  NextResponse.json(
    result.error
      ? { success: false, error: result.error }
      : { success: true, data: result.data },
    { status: result.status }
  )
