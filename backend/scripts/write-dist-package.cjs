const fs = require('node:fs');
const path = require('node:path');

const distDir = path.resolve(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  process.exit(0);
}

const pkgPath = path.join(distDir, 'package.json');
const pkg = {
  type: 'module',
};

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log('Wrote dist/package.json with type=module');
