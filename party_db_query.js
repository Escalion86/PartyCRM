const mongoose = require('mongoose');
async function main() {
  const uri = 'mongodb://admin:***@127.0.0.1:27017/?authSource=admin';
  await mongoose.connect(uri, {directConnection: true});
  
  const pdb = mongoose.connection.client.db('partycrm');
  
  const collections = await pdb.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name));
  
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
  
  const eventsCount = await pdb.collection('events').countDocuments();
  console.log('\nEvents:', eventsCount);
  const paymentsCount = await pdb.collection('payments').countDocuments();
  console.log('Payments:', paymentsCount);
  const clientsCount = await pdb.collection('clients').countDocuments();
  console.log('Clients:', clientsCount);
  const staffCount = await pdb.collection('staff').countDocuments();
  console.log('Staff:', staffCount);
  const locationsCount = await pdb.collection('locations').countDocuments();
  console.log('Locations:', locationsCount);
  const tariffsCount = await pdb.collection('tariffs').countDocuments();
  console.log('Tariffs:', tariffsCount);
  
  await mongoose.disconnect();
}
main().catch(e => console.error(e)).finally(() => process.exit(0));
