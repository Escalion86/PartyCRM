const mongoose = require('mongoose');
async function main() {
  const uri = 'mongodb://admin:Magister86@127.0.0.1:27017/?authSource=admin';
  await mongoose.connect(uri, {directConnection: true});
  
  const pdb = mongoose.connection.client.db('partycrm');
  
  const collections = await pdb.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name));
  
  for (const col of collections) {
    const count = await pdb.collection(col.name).countDocuments();
    console.log('  ' + col.name + ': ' + count + ' docs');
  }
  
  const users = await pdb.collection('users').find({}).toArray();
  console.log('\nUsers (' + users.length + '):');
  users.forEach(u => {
    console.log(JSON.stringify({
      _id: u._id.toString(),
      phone: u.phone,
      email: u.email,
      role: u.role,
      first_name: u.first_name,
      last_name: u.last_name,
      tenantId: u.tenantId ? u.tenantId.toString() : null,
      billingStatus: u.billingStatus,
      tariffId: u.tariffId ? u.tariffId.toString() : null
    }, null, 2));
  });
  
  const tenants = await pdb.collection('tenants').find({}).toArray();
  console.log('\nTenants (' + tenants.length + '):');
  tenants.forEach(t => {
    console.log(JSON.stringify({
      _id: t._id.toString(),
      name: t.name,
      slug: t.slug,
      status: t.status,
      plan: t.plan,
      ownerId: t.ownerId ? t.ownerId.toString() : null
    }, null, 2));
  });
  
  // Get a sample event with full details
  const events = await pdb.collection('events').find({}).limit(3).toArray();
  console.log('\nSample events:');
  events.forEach(e => {
    console.log(JSON.stringify({
      _id: e._id.toString(),
      title: e.title,
      status: e.status,
      clientId: e.clientId ? e.clientId.toString() : null,
      tenantId: e.tenantId ? e.tenantId.toString() : null,
      contractSum: e.contractSum,
      assignees: e.assignees,
      services: e.services
    }, null, 2));
  });
  
  await mongoose.disconnect();
}
main().catch(e => console.error(e)).finally(() => process.exit(0));
