// Build the live entrance from the existing tested staging entrance.
// Publish only public entrance assets; no env values or credentials.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function build(output = path.join(root, 'build', 'entry-production')) {
  const source = path.join(root, 'entry');
  const live = 'https://burando-mini-app.onrender.com';
  let js = fs.readFileSync(path.join(source, 'entry.js'), 'utf8');
  for (const expected of ["const backend = 'https://burando-v7-staging.onrender.com';", "backend + '/' + location.search", "data.environment === 'staging'"]) {
    if (!js.includes(expected)) throw Error('Entrance template changed: review live build');
  }
  js = js.replace('Public staging entrance.', 'Public production entrance.')
    .replaceAll('https://burando-v7-staging.onrender.com', live)
    .replace("backend + '/' + location.search", "backend + '/shop' + location.search")
    .replace("data.environment === 'staging'", "data.environment === 'production'")
    .replace("test:'TEST MUHITI · Haqiqiy pul yubormang'", "test:''")
    .replace("test:'ТЕСТОВАЯ СРЕДА · Не отправляйте реальные деньги'", "test:''");
  let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8')
    .replaceAll('https://burando-v7-staging.onrender.com', live)
    .replace("script-src 'self'; style-src 'self';", "script-src 'self' https://burando-mini-app.onrender.com https://telegram.org; style-src 'self' https://burando-mini-app.onrender.com 'unsafe-inline';")
    .replace("img-src 'self';", "img-src 'self' https: data: blob:;")
    .replace('<script src="/entry.js" defer></script>', '<script src="/live-store.js?v=2" defer></script>\n<script src="/entry.js?v=2" defer></script>')
    .replace('<small id="testNotice">TEST MUHITI · Haqiqiy pul yubormang</small>', '<small id="testNotice" hidden></small>');
  if (/burando-v7-staging|TEST MUHITI|ТЕСТОВАЯ СРЕДА/.test(js + html)) throw Error('Test configuration leaked into live entrance');
  fs.mkdirSync(output, {recursive:true});
  for (const [file, contents] of [['entry.js',js],['index.html',html],['entry.css',fs.readFileSync(path.join(source,'entry.css'),'utf8')]]) {
    fs.writeFileSync(path.join(output,file),contents);
  }
  fs.copyFileSync(path.join(source,'live-store.js'),path.join(output,'live-store.js'));
  return output;
}
module.exports = {build};
if (require.main === module) console.log('Live BURANDO entrance:', build());
