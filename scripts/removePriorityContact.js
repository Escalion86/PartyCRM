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

const run = async () => {
  loadEnvFile(path.join(__dirname, '..', '.env.local'))

  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('removePriorityContact: MONGODB_URI is missing')
    process.exit(1)
  }

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DBNAME })

  const ClientsSchema = new mongoose.Schema({}, { collection: 'clients' })
  const Clients =
    mongoose.models.Clients || mongoose.model('Clients', ClientsSchema)

  const result = await Clients.updateMany(
    { priorityContact: { $exists: true } },
    { $unset: { priorityContact: '' } }
  )

  console.log(
    `removePriorityContact: matched ${result.matchedCount ?? 0}, modified ${
      result.modifiedCount ?? 0
    }`
  )

  await mongoose.disconnect()
}

run().catch((error) => {
  console.error('removePriorityContact: error', error)
  process.exit(1)
})
