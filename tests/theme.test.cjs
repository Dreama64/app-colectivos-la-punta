const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const parser = require('@babel/parser');
const source = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
const app = ast.program.body.find(n => n.type === 'ExportDefaultDeclaration').declaration;
const functions = app.body.body.filter(n => n.type === 'VariableDeclaration')
  .filter(n => ['cargarTemaApp', 'cambiarTemaApp'].includes(n.declarations[0].id.name))
  .map(n => source.slice(n.start, n.end)).join('\n');
function mount(storage, getItem = async key => storage.get(key) || null, setItem = async (key, value) => storage.set(key, value)) {
  let theme = 'oscuro';
  const alerts = [];
  const api = vm.runInNewContext(functions + '\n({cargarTemaApp, cambiarTemaApp})', {
    AsyncStorage: { getItem, setItem }, setTemaApp: value => theme = value,
    temaElegidoRef: { current: false }, guardadoTemaRef: { current: Promise.resolve() },
    montadoRef: { current: true }, console: { log() {} },
    Alert: { alert: (...args) => alerts.push(args) },
  });
  return { ...api, alerts, get theme() { return theme; } };
}
test('theme changes immediately and survives reopening in either direction', async () => {
  const storage = new Map();
  const first = mount(storage);
  const save = first.cambiarTemaApp('claro');
  assert.equal(first.theme, 'claro'); await save;
  const second = mount(storage); await second.cargarTemaApp();
  assert.equal(second.theme, 'claro'); await second.cambiarTemaApp('oscuro');
  const third = mount(storage); await third.cargarTemaApp(); assert.equal(third.theme, 'oscuro');
  await third.cambiarTemaApp('invalid'); assert.equal(third.theme, 'oscuro');
});
test('late startup read cannot override an explicit selection', async () => {
  let resolve;
  const app = mount(new Map(), () => new Promise(r => { resolve = r; }));
  const load = app.cargarTemaApp(); await app.cambiarTemaApp('claro');
  resolve('oscuro'); await load; assert.equal(app.theme, 'claro');
});
test('rapid selections serialize writes and a failed save can be retried', async () => {
  const storage = new Map(); let release; let count = 0;
  const app = mount(storage, undefined, async (key, value) => {
    if (++count === 1) await new Promise(r => { release = r; });
    storage.set(key, value);
  });
  const first = app.cambiarTemaApp('claro'); const second = app.cambiarTemaApp('oscuro');
  await Promise.resolve(); assert.equal(count, 1); release();
  await Promise.all([first, second]); assert.equal(storage.get('tema_app'), 'oscuro');
  let fail = true;
  const retry = mount(storage, undefined, async (key, value) => {
    if (fail) throw Error('disk'); storage.set(key, value);
  });
  await retry.cambiarTemaApp('claro'); assert.equal(retry.alerts.length, 1);
  fail = false; await retry.cambiarTemaApp('claro'); assert.equal(storage.get('tema_app'), 'claro');
});
test('light styles change hub/settings colors, preserve layout and all other styles', () => {
  const styles = vm.runInNewContext(source.slice(source.indexOf('const estilosOscuros =')) + '\n({estilosOscuros, estilosClaros})', {
    StyleSheet: { create: value => value, flatten: value => value }, Platform: { OS: 'android' },
  });
  const dark = styles.estilosOscuros, light = styles.estilosClaros;
  for (const name of ['hubScreen', 'configScreen']) assert.equal(light[name].backgroundColor, '#f3f4f6');
  assert.equal(light.configTemaTextoActivo.color, '#854d0e');
  for (const name of Object.keys(dark)) {
    if (!/^(hub|config)/.test(name)) assert.deepEqual(light[name], dark[name]);
    for (const key of Object.keys(dark[name])) {
      if (!['color', 'backgroundColor', 'borderColor'].includes(key)) assert.deepEqual(light[name][key], dark[name][key]);
    }
  }
  assert.match(source, /const styles = temaApp === 'claro' \? estilosClaros : estilosOscuros/);
});
