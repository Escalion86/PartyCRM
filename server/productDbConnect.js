import mongoose from 'mongoose'
import { PRODUCTS, normalizeProduct } from './productContext.js'

export const getProductDbConfig = (product) => {
  const normalizedProduct = normalizeProduct(product)

  if (normalizedProduct === PRODUCTS.PARTYCRM) {
    return {
      product: PRODUCTS.PARTYCRM,
      uri: process.env.PARTYCRM_MONGODB_URI || process.env.MONGODB_URI,
      dbName: process.env.PARTYCRM_MONGODB_DBNAME || process.env.MONGODB_DBNAME,
    }
  }

  return {
    product: PRODUCTS.ARTISTCRM,
    uri: process.env.ARTISTCRM_MONGODB_URI || process.env.MONGODB_URI,
    dbName: process.env.ARTISTCRM_MONGODB_DBNAME || process.env.MONGODB_DBNAME,
  }
}

export const assertProductDbIsolation = () => {
  const hasPartyOverride = Boolean(
    process.env.PARTYCRM_MONGODB_URI || process.env.PARTYCRM_MONGODB_DBNAME
  )
  if (!hasPartyOverride) return true

  const artistConfig = getProductDbConfig(PRODUCTS.ARTISTCRM)
  const partyConfig = getProductDbConfig(PRODUCTS.PARTYCRM)
  const sameUri =
    String(artistConfig.uri || '').trim() === String(partyConfig.uri || '').trim()
  const sameDbName =
    String(artistConfig.dbName || '').trim() ===
    String(partyConfig.dbName || '').trim()

  if (sameUri && sameDbName) {
    throw new Error(
      'ArtistCRM and PartyCRM must use different MongoDB databases in a shared runtime.'
    )
  }
  return true
}

const getGlobalCache = () => {
  if (!global.productMongooseConnections) {
    global.productMongooseConnections = {}
  }
  return global.productMongooseConnections
}

export const getProductDbConnection = async (product = PRODUCTS.ARTISTCRM) => {
  assertProductDbIsolation()
  const config = getProductDbConfig(product)

  if (!config.uri) {
    throw new Error(
      `MongoDB URI is not configured for product "${config.product}".`
    )
  }

  const cacheKey = `${config.product}:${config.uri}:${config.dbName || ''}`
  const cache = getGlobalCache()

  if (cache[cacheKey]?.conn) {
    return cache[cacheKey].conn
  }

  if (!cache[cacheKey]) {
    cache[cacheKey] = { conn: null, promise: null }
  }

  if (!cache[cacheKey].promise) {
    mongoose.set('strictQuery', false)
    const connection = mongoose.createConnection(config.uri, {
      dbName: config.dbName,
      serverSelectionTimeoutMS: 5000,
    })

    cache[cacheKey].promise = connection.asPromise().then(() => connection)
  }

  cache[cacheKey].conn = await cache[cacheKey].promise
  return cache[cacheKey].conn
}

export const getProductModel = async ({
  product = PRODUCTS.ARTISTCRM,
  name,
  collectionName,
  schemaDefinition,
  schemaOptions = {},
  configureSchema,
}) => {
  if (!name || !schemaDefinition) {
    throw new Error('getProductModel requires model name and schemaDefinition.')
  }

  const connection = await getProductDbConnection(product)

  if (connection.models[name]) {
    return connection.models[name]
  }

  const schema = new mongoose.Schema(schemaDefinition, schemaOptions)
  if (typeof configureSchema === 'function') {
    configureSchema(schema)
  }

  return connection.model(name, schema, collectionName)
}
