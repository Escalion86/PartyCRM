const mongoose = require('mongoose');

async function main() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/artistcrm');
    const db = mongoose.connection.db;

    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name).join(', '));

    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(col.name + ': ' + count + ' docs');
    }

    const payments = await db.collection('payments').find({}).limit(5).toArray();
    console.log('\nPayments:', JSON.stringify(payments, null, 2));

    const txns = await db.collection('transactions').find({}).limit(5).toArray();
    console.log('\nTransactions:', JSON.stringify(txns, null, 2));

    const users = await db.collection('users').find({}).limit(5).toArray();
    console.log('\nUsers:', JSON.stringify(users.map(u => ({ _id: u._id, email: u.email, role: u.role, balance: u.balance, tenantId: u.tenantId, tariffId: u.tariffId, phone: u.phone })), null, 2));

    const events = await db.collection('events').find({}).limit(5).toArray();
    console.log('\nEvents:', JSON.stringify(events.map(e => ({ _id: e._id, title: e.title, status: e.status, clientId: e.clientId, tenantId: e.tenantId })), null, 2));

    const tariffs = await db.collection('tariffs').find({}).toArray();
    console.log('\nTariffs:', JSON.stringify(tariffs, null, 2));

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
}
main();
