const fs = require('fs')
const path = require('path')

const DEFAULT_API_BASE_URL = 'https://enter.tochka.com/uapi'

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

const normalizeApiUrl = (url) => String(url || DEFAULT_API_BASE_URL).replace(/\/$/, '')

const getTochkaConfig = () => {
  const apiUrl = normalizeApiUrl(process.env.TOCHKA_API_URL)
  const token = String(process.env.TOCHKA_API_TOKEN || '').trim()
  const rawCustomerCode = String(process.env.TOCHKA_CUSTOMER_CODE || '').trim()
  const customerCode =
    rawCustomerCode && rawCustomerCode !== '...' ? rawCustomerCode : ''
  return { apiUrl, token, customerCode }
}

const requestTochka = async ({ apiUrl, token, pathName }) => {
  const response = await fetch(`${apiUrl}${pathName}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })
  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error_description ||
      payload?.error ||
      text ||
      `HTTP ${response.status}`
    throw new Error(`${pathName}: ${message}`)
  }
  return payload
}

const asArray = (value) => {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  return (
    value.Data?.Customer ||
    value.Data?.Retailer ||
    value.Data?.Retailers ||
    value.Data?.retailers ||
    value.customers ||
    value.customer ||
    value.data ||
    value.result ||
    value.items ||
    value.list ||
    []
  )
}

const pick = (item, keys) => {
  for (const key of keys) {
    const value = item?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

const printJson = (label, value) => {
  console.log(`\n${label}`)
  console.log(JSON.stringify(value, null, 2))
}

const getCustomerCode = (customer) =>
  String(
    pick(customer, [
      'customerCode',
      'code',
      'id',
      'customerId',
      'companyId',
      'organizationId',
    ])
  ).trim()

const summarizeCustomer = (customer) => ({
  customerCode: getCustomerCode(customer),
  customerType: pick(customer, ['customerType', 'type']),
  name: pick(customer, ['shortName', 'fullName', 'name', 'companyName']),
  inn: pick(customer, ['inn', 'INN']),
})

const summarizeRetailer = (retailer) => ({
  merchantId: pick(retailer, ['merchantId', 'id', 'retailerId']),
  terminalId: pick(retailer, ['terminalId', 'terminal_id']),
  name: pick(retailer, ['name', 'retailerName', 'shopName']),
  status: pick(retailer, ['status', 'state']),
  isActive: pick(retailer, ['isActive', 'active']),
  paymentModes: pick(retailer, ['paymentModes', 'paymentMode']),
  raw: {
    customerCode: pick(retailer, ['customerCode']),
    fiscalization: pick(retailer, ['fiscalization', 'cashbox', 'ofd']),
  },
})

const run = async () => {
  loadEnvFile(path.join(__dirname, '..', '.env.local'))

  const config = getTochkaConfig()
  if (!config.token) {
    console.error('TOCHKA_API_TOKEN is missing in .env.local or environment')
    process.exit(1)
  }

  console.log(`Tochka API: ${config.apiUrl}`)
  console.log('Token: loaded')

  const customersPayload = await requestTochka({
    ...config,
    pathName: '/open-banking/v1.0/customers',
  })
  const customers = asArray(customersPayload)
  const customerSummaries = customers.map(summarizeCustomer)
  printJson('Customers', customerSummaries)

  const customerCodes = config.customerCode
    ? [config.customerCode]
    : customerSummaries
        .filter((customer) => customer.customerType === 'Business' || !customer.customerType)
        .map((customer) => customer.customerCode)
        .filter(Boolean)

  if (customerCodes.length === 0) {
    console.log('\nNo customerCode found.')
    console.log('Raw customers payload:')
    console.log(JSON.stringify(customersPayload, null, 2))
    console.log('\nCheck that the JWT key has access to a company and the required Tochka API scopes.')
    return
  }

  for (const customerCode of customerCodes) {
    const retailersPayload = await requestTochka({
      ...config,
      pathName: `/acquiring/v1.0/retailers?customerCode=${encodeURIComponent(customerCode)}`,
    })
    const retailers = asArray(retailersPayload).map(summarizeRetailer)
    printJson(`Retailers for customerCode=${customerCode}`, retailers)
  }
}

run().catch((error) => {
  console.error('tochkaDiscover: error')
  console.error(error?.message || error)
  process.exit(1)
})
