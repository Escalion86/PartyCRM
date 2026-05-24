const fs = require('fs');
const mongoose = require('mongoose');

const envContent = fs.readFileSync('/home/apps/artistcrm/.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)='?([^']*)'?$/);
  if (match) env[match[1]] = match[2];
});

const uri = 'mongodb://' + env.MONGODB_USER + ':' + env.MONGODB_PASSWORD + '@' + env.MONGODB_SERVER + ':' + env.MONGODB_PORT + '/?authSource=admin';

async function main() {
  try {
    await mongoose.connect(uri + '&dbName=partycrm');
    const db = mongoose.connection.db;
    
    // PartyOrders (the main 'events' equivalent)
    const orders = await db.collection('partyorders').find({}).limit(10).toArray();
    console.log('=== PARTY ORDERS (' + await db.collection('partyorders').countDocuments() + ' total) ===');
    orders.forEach(o => {
      console.log(JSON.stringify({
        _id: o._id,
        title: o.title,
        status: o.status,
        clientId: o.clientId,
        companyId: o.companyId,
        contractSum: o.contractSum,
        date: o.date,
        createdAt: o.createdAt
      }, null, 2));
    });
    
    // PartyPayments
    const payments = await db.collection('partypayments').find({}).toArray();
    console.log('\n=== PARTY PAYMENTS (' + await db.collection('partypayments').countDocuments() + ' total) ===');
    console.log(JSON.stringify(payments, null, 2));
    
    // PartyUsers
    const users = await db.collection('partyusers').find({}).limit(5).toArray();
    console.log('\n=== PARTY USERS (' + await db.collection('partyusers').countDocuments() + ' total) ===');
    users.forEach(u => {
      console.log(JSON.stringify({
        _id: u._id,
        email: u.email,
        role: u.role,
        balance: u.balance,
        companyId: u.companyId,
        phone: u.phone
      }, null, 2));
    });
    
    // PartyTariffs
    const tariffs = await db.collection('partytariffs').find({}).toArray();
    console.log('\n=== PARTY TARIFFS ===');
    console.log(JSON.stringify(tariffs, null, 2));
    
    // PartyClients
    const clients = await db.collection('partyclients').find({}).limit(5).toArray();
    console.log('\n=== PARTY CLIENTS (' + await db.collection('partyclients').countDocuments() + ' total) ===');
    clients.forEach(c => {
      console.log(JSON.stringify({
        _id: c._id,
        name: c.name,
        phone: c.phone,
        email: c.email
      }, null, 2));
    });
    
    // PartyCompanies
    const companies = await db.collection('partycompanies').find({}).toArray();
    console.log('\n=== PARTY COMPANIES ===');
    console.log(JSON.stringify(companies.map(c => ({
      _id: c._id,
      name: c.name,
      tenantId: c.tenantId
    })), null, 2));
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
}
main();
