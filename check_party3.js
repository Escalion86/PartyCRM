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
    
    // Get all orders with their full data
    const orders = await db.collection('partyorders').find({}).toArray();
    console.log('=== ALL PARTY ORDERS ===');
    orders.forEach(o => {
      console.log(JSON.stringify({
        _id: o._id,
        title: o.title,
        status: o.status,
        clientId: o.clientId,
        tenantId: o.tenantId,
        eventDate: o.eventDate,
        dateEnd: o.dateEnd,
        contractAmount: o.contractAmount,
        clientPayment: o.clientPayment,
        transactions: o.transactions,
        assignedStaff: o.assignedStaff,
        placeType: o.placeType,
        locationId: o.locationId,
        servicesIds: o.servicesIds,
        serviceTitle: o.serviceTitle,
        adminComment: o.adminComment,
        createdAt: o.createdAt
      }, null, 2));
      console.log('---');
    });
    
    // Get the test user
    const testUser = await db.collection('partyusers').findOne({ email: 'test-partycrm@test.com' });
    console.log('\n=== TEST USER ===');
    console.log(JSON.stringify(testUser, null, 2));
    
    // Get the company for this user
    if (testUser) {
      const company = await db.collection('partycompanies').findOne({ tenantId: testUser.tenantId });
      console.log('\n=== COMPANY ===');
      console.log(JSON.stringify(company, null, 2));
    }
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
}
main();
