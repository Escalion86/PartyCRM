const path = require('path')
const { pathToFileURL } = require('url')

async function importModule(relativePath) {
  return import(pathToFileURL(path.resolve(__dirname, relativePath)).href)
}

async function main() {
  const { PRODUCTS } = await importModule('../server/productContext.js')
  const { getProductDbConnection } = await importModule(
    '../server/productDbConnect.js'
  )

  const connection = await getProductDbConnection(PRODUCTS.PARTYCRM)
  const db = connection.db

  const collectionPairs = [
    [['partycompanies'], 'companies'],
    [['partyusers'], 'users'],
    [['partystaffs', 'partystaff'], 'staff'],
    [['partylocations'], 'locations'],
    [['partyclients'], 'clients'],
    [['partyassignments'], 'assignments'],
    [['partyservices'], 'services'],
    [['partyorders'], 'orders'],
    [['partytariffs'], 'tariffs'],
    [['partypayments'], 'payments'],
  ]

  const existingCollections = await db.listCollections().toArray()
  const existingNames = new Set(existingCollections.map((item) => item.name))

  for (const [fromCandidates, toName] of collectionPairs) {
    const fromName = fromCandidates.find((candidate) => existingNames.has(candidate))

    if (!fromName) {
      console.log(`[skip] ${fromCandidates.join(' or ')} not found`)
      continue
    }

    if (existingNames.has(toName)) {
      console.log(`[skip] ${toName} already exists`)
      continue
    }

    console.log(`[rename] ${fromName} -> ${toName}`)
    await db.collection(fromName).rename(toName)
  }

  await connection.close()
  console.log('PartyCRM collection rename finished')
}

main().catch((error) => {
  console.error('partyRenameCollections failed:', error)
  process.exit(1)
})
