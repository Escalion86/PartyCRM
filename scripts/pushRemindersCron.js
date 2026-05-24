/**
 * Push Reminders Cron Script
 * 
 * This script is called by the system cron job every 15 minutes.
 * It connects to the local Next.js API to trigger push reminders
 * for upcoming and overdue events.
 * 
 * Usage: node scripts/pushRemindersCron.js
 * Cron: every 15 minutes
 */

const https = require('https')
const http = require('http')
const { execSync } = require('child_process')

const API_HOST = process.env.LOCAL_API_HOST || '127.0.0.1'
const API_PORT = process.env.LOCAL_API_PORT || '3000'
const CRON_SECRET = process.env.PUSH_REMINDERS_CRON_SECRET || process.env.CRON_SECRET || ''
const REMINDERS_PATH = '/api/push/reminders/additional-events'

function makeRequest() {
  return new Promise((resolve, reject) => {
    const url = `http://${API_HOST}:${API_PORT}${REMINDERS_PATH}`
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
      timeout: 30000,
    }

    const req = http.request(url, options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, data })
        }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    req.end()
  })
}

async function main() {
  const startTime = Date.now()
  console.log(`[${new Date().toISOString()}] Push reminders cron started`)

  try {
    const result = await makeRequest()
    const elapsed = Date.now() - startTime

    if (result.status === 200 && result.data?.success) {
      const d = result.data.data || {}
      console.log(`[OK] Push reminders completed in ${elapsed}ms`)
      console.log(`  Events processed: ${d.processedEvents || 0}`)
      console.log(`  Due candidates: ${d.dueCandidates || 0}`)
      console.log(`  Sent: ${d.sentReminders || 0}`)
      console.log(`  Skipped (dedup): ${d.skippedByDedup || 0}`)
      console.log(`  Skipped (time): ${d.skippedByTime || 0}`)
      console.log(`  Failed: ${d.failed || 0}`)
      console.log(`  Tenants: ${d.tenants || 0}, scheduled: ${d.scheduledTenants || 0}`)
    } else {
      console.error(`[FAIL] Push reminders failed: status=${result.status}`)
      console.error(`  Response: ${JSON.stringify(result.data)}`)
      process.exit(1)
    }
  } catch (error) {
    console.error(`[ERROR] Push reminders cron error: ${error.message}`)
    process.exit(1)
  }
}

main()
