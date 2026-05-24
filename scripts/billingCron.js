const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) return
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    value = value.replace(/\$\{([^}]+)\}/g, (_, name) => {
      return process.env[name] ?? ''
    })
    if (process.env[key] === undefined) process.env[key] = value
  })
}

const addMonth = (date) => {
  const next = new Date(date)
  const day = next.getDate()
  next.setMonth(next.getMonth() + 1)
  if (next.getDate() < day) {
    next.setDate(0)
  }
  return next
}

const run = async () => {
  loadEnvFile(path.join(__dirname, '..', '.env.local'))

  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('billingCron: MONGODB_URI is missing')
    process.exit(1)
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DBNAME })

  const UserSchema = new mongoose.Schema(
    {
      tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
      tariffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tariffs' },
      balance: { type: Number, default: 0 },
      billingStatus: { type: String, default: 'active' },
      tariffActiveUntil: { type: Date, default: null },
      nextChargeAt: { type: Date, default: null },
      trialEndsAt: { type: Date, default: null },
    },
    { collection: 'users' }
  )

  const TariffSchema = new mongoose.Schema(
    {
      title: String,
      price: Number,
      hidden: Boolean,
    },
    { collection: 'tariffs' }
  )

  const PaymentSchema = new mongoose.Schema(
    {
      tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
      tariffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tariffs' },
      amount: Number,
      type: String,
      source: String,
      comment: String,
    },
    { collection: 'payments', timestamps: true }
  )

  const Users = mongoose.models.Users || mongoose.model('Users', UserSchema)
  const Tariffs =
    mongoose.models.Tariffs || mongoose.model('Tariffs', TariffSchema)
  const Payments =
    mongoose.models.Payments || mongoose.model('Payments', PaymentSchema)

  const tariffs = await Tariffs.find({}).lean()
  if (!tariffs.length) {
    console.log('billingCron: no tariffs found')
    await mongoose.disconnect()
    return
  }

  const sortedTariffs = [...tariffs].sort((a, b) => {
    const priceDiff = (a.price ?? 0) - (b.price ?? 0)
    if (priceDiff !== 0) return priceDiff
    return String(a.title || '').localeCompare(String(b.title || ''), 'ru')
  })
  const freeTariff =
    sortedTariffs.find((item) => (item.price ?? 0) === 0 && !item.hidden) ||
    sortedTariffs[0]

  const now = new Date()
  const dueUsers = await Users.find({
    tariffId: { $ne: null },
    nextChargeAt: { $ne: null, $lte: now },
  }).lean()

  if (!dueUsers.length) {
    console.log('billingCron: no users to charge')
    await mongoose.disconnect()
    return
  }

  for (const user of dueUsers) {
    if (user.trialEndsAt && new Date(user.trialEndsAt) > now) {
      continue
    }

    const tariff = tariffs.find(
      (item) => String(item._id) === String(user.tariffId)
    )

    if (!tariff) {
      if (freeTariff?._id) {
        await Users.updateOne(
          { _id: user._id },
          {
            $set: {
              tariffId: freeTariff._id,
              billingStatus: 'debt',
              tariffActiveUntil: null,
              nextChargeAt: null,
            },
          }
        )
      }
      continue
    }

    const price = Number(tariff.price ?? 0)
    if (price <= 0) {
      await Users.updateOne(
        { _id: user._id },
        {
          $set: {
            billingStatus: 'active',
            tariffActiveUntil: null,
            nextChargeAt: null,
          },
        }
      )
      continue
    }

    const balance = Number(user.balance ?? 0)
    if (Number.isFinite(balance) && balance >= price) {
      const nextChargeAt = addMonth(user.nextChargeAt || now)
      await Users.updateOne(
        { _id: user._id },
        {
          $set: {
            balance: balance - price,
            billingStatus: 'active',
            tariffActiveUntil: nextChargeAt,
            nextChargeAt,
          },
        }
      )
      const chargeComment = `Оплата тарифа "${tariff.title}"`
      await Payments.create({
        userId: user._id,
        tenantId: user.tenantId ?? user._id,
        tariffId: tariff._id,
        amount: price,
        type: 'charge',
        source: 'system',
        comment: chargeComment,
      })
    } else if (freeTariff?._id) {
      await Users.updateOne(
        { _id: user._id },
        {
          $set: {
            tariffId: freeTariff._id,
            billingStatus: 'debt',
            tariffActiveUntil: null,
            nextChargeAt: null,
          },
        }
      )
    }
  }

  await mongoose.disconnect()
}

run().catch((error) => {
  console.error('billingCron: error', error)
  process.exit(1)
})
