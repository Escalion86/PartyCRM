import mongoose from 'mongoose'
import { PRODUCTS, normalizeProduct } from './productContext'

const getProductDbConfig = (product) => {
  const normalizedProduct = normalizeProduct(product)

  if (normalizedProduct === PRODUCTS.PARTYCRM) {
    return {
      product: PRODUCTS.PARTYCRM,
      uri: process.env.PARTYCRM_MONGODB_URI,
      dbName: process.env.PARTYCRM_MONGODB_DBNAME,
    }
  }

  return {
    product: PRODUCTS.ARTISTCRM,
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DBNAME,
  }
}

const getGlobalCache = () => {
  if (!global.productMongooseConnections) {
    global.productMongooseConnections = {}
  }
  return global.productMongooseConnections
}

export const getProductDbConnection = async (product = PRODUCTS.ARTISTCRM) => {
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

  return connection.model(name, schema)
}
