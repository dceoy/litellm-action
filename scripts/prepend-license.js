const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/prepend-license.js <licenses-file>');
  process.exit(1);
}

const rootLicense = fs.readFileSync(
  path.join(__dirname, '..', 'LICENSE'),
  'utf8',
);
const thirdParty = fs.readFileSync(target, 'utf8');

fs.writeFileSync(
  target,
  `litellm-action\nAGPL-3.0\n${rootLicense}\n${thirdParty}`,
);
