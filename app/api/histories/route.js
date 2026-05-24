import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Histories from '@models/Histories'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const isValidId = (value) => mongoose.Types.ObjectId.isValid(value)

const ensureItemInTenant = async (schema, itemId, tenantId) => {
  if (!schema || !itemId || !tenantId) return false
  if (schema === 'events') {
    return Boolean(
      await Events.findOne({ _id: itemId, tenantId }).select('_id').lean()
    )
  }
  return false
}

export const GET = async (req) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(req.url)
  const schema = String(searchParams.get('schema') ?? '').trim()
  const rawId = String(searchParams.get('data._id') ?? '').trim()

  if (!schema || !rawId || !isValidId(rawId)) {
    return NextResponse.json({ success: true, data: [] }, { status: 200 })
  }

  await dbConnect()

  const isAllowed = await ensureItemInTenant(schema, rawId, tenantId)
  if (!isAllowed) {
    return NextResponse.json({ success: true, data: [] }, { status: 200 })
  }

  const query = {
    schema,
    'data._id': new mongoose.Types.ObjectId(rawId),
  }
  const histories = await Histories.find(query)
    .sort({ createdAt: 1 })
    .lean()

  return NextResponse.json({ success: true, data: histories }, { status: 200 })
}
