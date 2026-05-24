const mongoose = require('mongoose');
async function main() {
  const uri = 'mongodb://admin:Magister86@127.0.0.1:27017/?authSource=admin';
  await mongoose.connect(uri, {directConnection: true});
  const pdb = mongoose.connection.client.db('partycrm');
  
  // Users
  const users = await pdb.collection('partyusers').find({}).toArray();
  console.log('Users (' + users.length + '):');
  users.forEach(u => {
    console.log(JSON.stringify({
      _id: u._id.toString(),
      phone: u.phone,
      email: u.email,
      role: u.role,
      first_name: u.first_name,
      last_name: u.last_name,
      companyId: u.companyId ? u.companyId.toString() : null,
      tenantId: u.tenantId ? u.tenantId.toString() : null,
      billingStatus: u.billingStatus,
      tariffId: u.tariffId ? u.tariffId.toString() : null,
      password: u.password ? '[HAS HASH]' : 'NO PASSWORD'
    }, null, 2));
  });
  
  // Companies
  const companies = await pdb.collection('partycompanies').find({}).toArray();
  console.log('\nCompanies (' + companies.length + '):');
  companies.forEach(c => {
    console.log(JSON.stringify({
      _id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      status: c.status,
      ownerId: c.ownerId ? c.ownerId.toString() : null,
      tariffId: c.tariffId ? c.tariffId.toString() : null
    }, null, 2));
  });
  
  // Orders
  const orders = await pdb.collection('partyorders').find({}).limit(5).toArray();
  console.log('\nOrders (' + (await pdb.collection('partyorders').countDocuments()) + ' total, showing 5):');
  orders.forEach(o => {
    console.log(JSON.stringify({
      _id: o._id.toString(),
      title: o.title,
      status: o.status,
      clientId: o.clientId ? o.clientId.toString() : null,
      companyId: o.companyId ? o.companyId.toString() : null,
      contractAmount: o.contractAmount,
      assignees: o.assignees
    }, null, 2));
  });
  
  // Payments
  const payments = await pdb.collection('partypayments').find({}).toArray();
  console.log('\nPayments (' + payments.length + '):');
  payments.forEach(p => {
    console.log(JSON.stringify({
      _id: p._id.toString(),
      status: p.status,
      amount: p.amount,
      orderId: p.orderId ? p.orderId.toString() : null,
      companyId: p.companyId ? p.companyId.toString() : null,
      type: p.type,
      source: p.source
    }, null, 2));
  });
  
  // Clients
  const clients = await pdb.collection('partyclients').find({}).limit(5).toArray();
  console.log('\nClients (' + (await pdb.collection('partyclients').countDocuments()) + ' total):');
  clients.forEach(c => {
    console.log(JSON.stringify({
      _id: c._id.toString(),
      name: c.name,
      phone: c.phone,
      email: c.email,
      companyId: c.companyId ? c.companyId.toString() : null
    }, null, 2));
  });
  
  // Staff
  const staff = await pdb.collection('partystaffs').find({}).limit(5).toArray();
  console.log('\nStaff (' + (await pdb.collection('partystaffs').countDocuments()) + ' total):');
  staff.forEach(s => {
    console.log(JSON.stringify({
      _id: s._id.toString(),
      name: s.name,
      phone: s.phone,
      role: s.role,
      companyId: s.companyId ? s.companyId.toString() : null
    }, null, 2));
  });
  
  // Tariffs
  const tariffs = await pdb.collection('partytariffs').find({}).toArray();
  console.log('\nTariffs:');
  tariffs.forEach(t => {
    console.log(JSON.stringify({
      _id: t._id.toString(),
      name: t.name,
      price: t.price,
      limits: t.limits
    }, null, 2));
  });
  
  await mongoose.disconnect();
}
main().catch(e => console.error(e)).finally(() => process.exit(0));
