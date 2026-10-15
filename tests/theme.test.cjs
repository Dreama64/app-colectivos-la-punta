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
test('light styles cover every screen and preserve all layout and state properties', () => {
  const styles = vm.runInNewContext(source.slice(source.indexOf('const estilosOscuros =')) + '\n({estilosOscuros, estilosClaros})', {
    StyleSheet: { create: value => value, flatten: value => value }, Platform: { OS: 'android' },
  });
  const dark = styles.estilosOscuros, light = styles.estilosClaros;
  for (const name of ['hubScreen', 'configScreen', 'radioScreen', 'chatScreen', 'reporteScreen', 'selectorScreen', 'registroScreen', 'container']) assert.equal(light[name].backgroundColor, '#f3f4f6');
  assert.equal(light.configTemaTextoActivo.color, '#854d0e');
  for (const name of Object.keys(dark)) {
    for (const key of Object.keys(dark[name])) {
      if (!['color', 'backgroundColor', 'borderColor', 'borderBottomColor', 'borderLeftColor', 'shadowColor'].includes(key)) assert.deepEqual(light[name][key], dark[name][key]);
    }
  }
  assert.match(source, /const styles = temaApp === 'claro' \? estilosClaros : estilosOscuros/);
});

test('PTT states, chat bubbles, report inputs and accent buttons remain readable', () => {
  const { estilosOscuros: dark, estilosClaros: light } = vm.runInNewContext(
    source.slice(source.indexOf('const estilosOscuros =')) + '\n({estilosOscuros, estilosClaros})', {
      StyleSheet: { create: value => value, flatten: value => value }, Platform: { OS: 'ios' },
    });
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255)
      .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (fg, bg) => {
    const a = luminance(fg), b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  for (const state of ['btnInactive', 'btnActive', 'btnListening']) {
    for (const text of ['btnText', 'subTexto']) assert.ok(contrast(light[text].color, light[state].backgroundColor) >= 4.5, state + '/' + text);
  }
  assert.equal(light.btnActive.backgroundColor, '#fee2e2');
  assert.notEqual(light.btnInactive.borderColor, light.btnListening.borderColor);
  for (const bubble of ['burbujaMia', 'burbujaAjena']) {
    for (const text of ['textoMensajeChat', 'textoHoraChat', 'textoEmisorChat']) {
      assert.ok(contrast(light[text].color, light[bubble].backgroundColor) >= 4.5, bubble + '/' + text);
    }
  }
  for (const input of ['registroInput', 'configNombreInput', 'chatInput', 'reporteInputDetalle']) {
    assert.ok(contrast(light[input].color, light[input].backgroundColor) >= 4.5, input);
  }
  for (const [button, text] of [['registroBoton', 'registroBotonTexto'], ['configVolver', 'configVolverTexto'], ['reporteEnviar', 'reporteEnviarTexto'], ['chatEnviar', 'chatEnviarTexto']]) {
    assert.equal(light[button].backgroundColor, dark[button].backgroundColor);
    assert.ok(contrast(light[text].color, light[button].backgroundColor) >= 4.5, button);
  }
});

test('inline theme colors adapt status and placeholders without changing their source state', () => {
  const colors = vm.runInNewContext(source.slice(source.indexOf('const coloresClaros ='), source.indexOf('const estilosClaros =')) + '\ncoloresClaros');
  const declaration = source.match(/const colorTema = .*;/)[0];
  for (const temaApp of ['claro', 'oscuro']) {
    const colorTema = vm.runInNewContext(declaration + '\ncolorTema', { temaApp, coloresClaros: colors });
    for (const color of ['#2ed573', '#ff4757', '#a4b0be', '#eccc68', '#656d78', '#d4af37', '#8d939d']) {
      assert.equal(colorTema(color), temaApp === 'claro' ? colors[color] : color);
    }
  }
  assert.match(source, /backgroundColor: colorTema\(statusColor\)/);
  assert.match(source, /color: colorTema\(statusColor\)/);
  assert.equal(source.split("placeholderTextColor={colorTema('#656d78')}").length - 1, 4);
});
