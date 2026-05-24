/**
 * VAPID Key Generation Script
 * 
 * Run this once to generate VAPID keys for push notifications:
 *   node scripts/generateVapidKeys.js
 * 
 * Then add the output to your .env.local and .env.deploy files:
 *   VAPID_PUBLIC_KEY=<public_key>
 *   VAPID_PRIVATE_KEY=<private_key>
 *   VAPID_SUBJECT=mailto:your@email.com
 */

const webpush = require('web-push')

const vapidKeys = webpush.generateVAPIDKeys()

console.log('=== VAPID Keys Generated ===')
console.log('')
console.log('Add these to your .env.local and .env.deploy files:')
console.log('')
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`)
console.log(`VAPID_SUBJECT=mailto:escalion86@gmail.com`)
console.log('')
console.log('Also add to .env.deploy:')
console.log('PUSH_REMINDERS_CRON_SECRET=<generate_a_random_secret>')
console.log('')
console.log('For the cron secret, you can use:')
console.log(`PUSH_REMINDERS_CRON_SECRET=${require('crypto').randomBytes(32).toString('hex')}`)
