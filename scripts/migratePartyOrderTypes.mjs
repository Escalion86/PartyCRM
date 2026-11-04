import { pathToFileURL } from 'node:url'
import mongoose from 'mongoose'

const normalized = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ru')

// Only configured dictionary entries are eligible. Existing commercial fields stay intact.
export async function migratePartyOrderTypes({
  db,
  apply = false,
  companyId,
  onProgress = console.log,
}) {
  const companies = db.collection('companies')
  const types = db.collection('orderTypes')
  const orders = db.collection('orders')
  const filter = companyId
    ? { _id: new mongoose.Types.ObjectId(companyId) }
    : {}
  let created = 0,
    linked = 0,
    scanned = 0
  for await (const company of companies.find(filter).project({ settings: 1 })) {
    scanned++
    const dictionary = new Map(
      (company.settings?.orderTypes || [])
        .map((entry) => {
          const title = String(entry?.title || entry || '').trim()
          return [normalized(title), title]
        })
        .filter(([key]) => key)
    )
    const existing = await types.find({ tenantId: company._id }).toArray()
    const byName = new Map()
    for (const entry of existing) {
      const key = entry.normalizedTitle || normalized(entry.title)
      if (byName.has(key))
        throw Error(
          'Неоднозначные типы заказа: исправьте дубли перед миграцией'
        )
      byName.set(key, entry)
    }
    for (const [key, title] of company.settings?.orderTypesMigrated
      ? []
      : dictionary) {
      if (byName.has(key)) continue
      const entry = {
        _id: new mongoose.Types.ObjectId(),
        tenantId: company._id,
        normalizedTitle: key,
        title,
        active: true,
        revision: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      created++
      if (apply) {
        await types.updateOne(
          { tenantId: company._id, normalizedTitle: key },
          { $setOnInsert: entry },
          { upsert: true }
        )
        byName.set(
          key,
          await types.findOne({ tenantId: company._id, normalizedTitle: key })
        )
      } else byName.set(key, entry)
    }
    // Include renamed types, but only an exact normalized name can establish a link.
    for await (const order of orders
      .find({ tenantId: company._id, orderTypeId: null })
      .project({ title: 1 })) {
      const match = byName.get(normalized(order.title))
      if (!match) continue
      linked++
      if (apply)
        await orders.updateOne(
          { _id: order._id, tenantId: company._id, orderTypeId: null },
          { $set: { orderTypeId: match._id, orderTypeSnapshot: match.title } }
        )
    }
    if (apply)
      await companies.updateOne(
        { _id: company._id },
        { $set: { 'settings.orderTypesMigrated': true } }
      )
  }
  const result = {
    mode: apply ? 'apply' : 'dry-run',
    companies: scanned,
    typesToCreate: created,
    ordersToLink: linked,
  }
  onProgress(JSON.stringify(result))
  return result
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let connection
  try {
    const { default: nextEnv } = await import('@next/env')
    nextEnv.loadEnvConfig(process.cwd())
    const uri = process.env.PARTYCRM_MONGODB_URI || process.env.MONGODB_URI
    const dbName =
      process.env.PARTYCRM_MONGODB_DBNAME || process.env.MONGODB_DBNAME
    if (!uri || !dbName)
      throw Error('Укажите URI и имя базы PartyCRM в окружении')
    const companyId = process.argv
      .find((entry) => entry.startsWith('--company='))
      ?.split('=')[1]
    if (companyId && !/^[a-f\d]{24}$/i.test(companyId))
      throw Error('Некорректный --company')
    connection = await mongoose
      .createConnection(uri, { dbName, serverSelectionTimeoutMS: 5000 })
      .asPromise()
    await migratePartyOrderTypes({
      db: connection.db,
      apply: process.argv.includes('--apply'),
      companyId,
    })
  } catch (error) {
    console.error(
      'Миграция типов заказа не завершена:',
      error?.code || 'Проверьте настройки и диагностический журнал'
    )
    process.exitCode = 1
  } finally {
    await connection?.close()
  }
}
