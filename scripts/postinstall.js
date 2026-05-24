const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'node_modules', 'form-data', 'lib', 'form_data.js');

if (!fs.existsSync(targetPath)) {
  console.warn('[postinstall] form-data not found, skipping util.isArray patch');
  process.exit(0);
}

const source = fs.readFileSync(targetPath, 'utf8');

if (!source.includes('util.isArray')) {
  console.log('[postinstall] form-data already patched');
  process.exit(0);
}

const updated = source.replace(/util\.isArray/g, 'Array.isArray');

fs.writeFileSync(targetPath, updated, 'utf8');
console.log('[postinstall] Patched form-data to use Array.isArray');
