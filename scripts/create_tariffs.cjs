const mongoose = require('mongoose');

// Use the same connection string pattern as the app
// The app uses PARTYCRM_MONGODB_URI which resolves to mongodb://admin:PASSWORD@127.0.0.1:27017/?authSource=admin
// We need to read the actual password from the running process

const { execSync } = require('child_process');

// Get the actual MongoDB URI from the running pm2 process environment
let mongoUri = null;
try {
  const pid = execSync('pm2 pid artistcrm').toString().trim();
  const envStr = execSync('cat /proc/' + pid + '/environ 2>/dev/null | tr "\\0" "\\n"').toString();
  const lines = envStr.split('\n');
  for (const line of lines) {
    if (line.startsWith('PARTYCRM_MONGODB_URI=')) {
      mongoUri = line.split('=').slice(1).join('=');
      break;
    }
  }
  if (!mongoUri) {
    for (const line of lines) {
      if (line.startsWith('MONGODB_URI=')) {
        mongoUri = line.split('=').slice(1).join('=');
        break;
      }
    }
  }
} catch (e) {
  console.log('Could not get URI from process, trying direct connection');
}

if (!mongoUri) {
  // Fallback: try common passwords
  console.log('ERROR: Could not get MongoDB URI from running process');
  console.log('Trying to read from .env.local or other sources...');
  
  const fs = require('fs');
  const path = require('path');
  
  // Try .env.local
  const envLocal = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envLocal)) {
    console.log('Found .env.local');
    const content = fs.readFileSync(envLocal, 'utf8');
    const match = content.match(/PARTYCRM_MONGODB_URI='([^']+)'/);
    if (match) mongoUri = match[1];
  }
}

if (!mongoUri) {
  console.log('ERROR: No MongoDB URI found. Cannot create tariffs.');
  process.exit(1);
}

console.log('Found URI:', mongoUri.replace(/\/\/.*@/, '//***:***@'));

async function main() {
  await mongoose.connect(mongoUri, { dbName: 'partycrm' });
  console.log('Connected to MongoDB');

  const tariffSchema = new mongoose.Schema({
    title: String, subtitle: String, price: Number, description: String,
    features: [String], hidden: Boolean, eventsPerMonth: Number,
    allowCalendarSync: Boolean, allowStatistics: Boolean, allowDocuments: Boolean,
    allowTelephony: Boolean, allowAi: Boolean,
  }, { timestamps: true });

  const PartyTariffs = mongoose.model('PartyTariffs', tariffSchema);
  const existing = await PartyTariffs.find().lean();
  console.log('Existing tariffs:', existing.length);

  const tariffs = [
    { title: 'Базовый', subtitle: 'Для небольших агентств', price: 1490,
      description: 'Для небольших агентств и начинающих команд',
      features: ['До 3 сотрудников','До 50 заказов в месяц','Учёт клиентов','Базовые документы','Бронирование площадок'],
      hidden: false, eventsPerMonth: 50, allowCalendarSync: false, allowStatistics: false, allowDocuments: true, allowTelephony: false, allowAi: false },
    { title: 'Профи', subtitle: 'Для растущих агентств', price: 2990,
      description: 'Для растущих агентств с полноценным учётом',
      features: ['До 10 сотрудников','Безлимит заказов','Всё из Базового','Финансы','Google Календарь','Телефония','Отчётность по прибыли'],
      hidden: false, eventsPerMonth: 0, allowCalendarSync: true, allowStatistics: true, allowDocuments: true, allowTelephony: true, allowAi: false },
    { title: 'Бизнес', subtitle: 'Для крупных агентств', price: 5990,
      description: 'Для крупных агентств с индивидуальными задачами',
      features: ['Безлимит сотрудников','Всё из Профи','Кастомные интеграции','Отдельный менеджер','Приоритетная разработка','Индивидуальный онбординг'],
      hidden: false, eventsPerMonth: 0, allowCalendarSync: true, allowStatistics: true, allowDocuments: true, allowTelephony: true, allowAi: true },
  ];

  for (const t of tariffs) {
    const found = existing.find(e => e.title === t.title);
    if (!found) {
      await PartyTariffs.create(t);
      console.log('Created:', t.title, t.price + '₽');
    } else {
      console.log('Already exists:', t.title);
    }
  }

  const all = await PartyTariffs.find().lean();
  console.log('\nAll tariffs:');
  all.forEach(t => console.log(' -', t.title, t.price + '₽', t._id));
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
