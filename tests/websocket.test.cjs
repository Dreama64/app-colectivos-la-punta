const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const appFile = process.env.APP_UNDER_TEST || path.join(__dirname, '../App.js');
const parser = require('@babel/parser');

// Run the actual component's non-visual code with deterministic hooks and timers.
function mount(storage = new Map([['nombre_chofer', 'Juan Soto']])) {
  const source = fs.readFileSync(appFile, 'utf8');
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const declaration = ast.program.body.find(n => n.type === 'ExportDefaultDeclaration');
  const imports = ast.program.body.filter(n => n.type === 'ImportDeclaration');
  const prelude = source.slice(imports.at(-1).end, declaration.start);
  const body = source.slice(declaration.declaration.body.start + 1, source.indexOf('// 📝 PANTALLA 1'))
    .replace(/const \[(\w+), (\w+)\] = useState\(/g, "const [$1, $2] = useNamedState('$1', ");
  const effects = [], timers = new Map(), sockets = [], state = {};
  let nextTimer = 0;
  class Socket {
    static OPEN = 1; static CONNECTING = 0;
    constructor() { this.readyState = 0; this.sent = []; sockets.push(this); }
    send(message) { assert.equal(this.readyState, 1); this.sent.push(JSON.parse(message)); }
    open() { this.readyState = 1; this.onopen?.(); }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  }
  const sandbox = {
    useNamedState(name, initial) { state[name] = initial; return [initial, value => state[name] = value]; },
    useRef: current => ({ current }), useEffect: effect => effects.push(effect),
    AsyncStorage: { getItem: async key => storage.get(key) || null, setItem: async (key, value) => storage.set(key, value) },
    WebSocket: Socket, console: { log() {} },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    Audio: { requestPermissionsAsync: async () => {} },
    ColectivosBackground: { start() {} }
  };
  const api = vm.runInNewContext(prelude + '\n(function(){' + body + `
    return { conectarWebSocket, comprobarYReconectar, comprobarUsuario, salirDelCanal,
      ws, enCanalRef, canalActivoRef };
  })()`, sandbox);
  const cleanups = effects.map(effect => effect()).filter(Boolean);
  return { ...api, state, sockets, timers, storage,
    unmount: () => cleanups.forEach(cleanup => cleanup()),
    async runTimers(delay) {
      for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); }
      await flush();
    }
  };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('unmount must not create a live orphan connection three seconds later', async () => {
  const app = mount();
  app.enCanalRef.current = true;
  await app.conectarWebSocket('Juan Soto'); app.sockets[0].open();
  app.unmount(); await app.runTimers(3000);
  assert.equal(app.sockets.length, 1);
  assert.equal(app.sockets.filter(s => s.readyState < 2).length, 0);
});
test('installation identity survives remount and rename; hub stays outside channels', async () => {
  const storage = new Map([['nombre_chofer', 'Juan Soto']]);
  const first = mount(storage); first.enCanalRef.current = true;
  await first.conectarWebSocket('Juan Soto'); first.sockets[0].open();
  const id = first.sockets[0].sent[0].clienteId; first.unmount();
  storage.set('nombre_chofer', 'Andrés Cruz');
  const second = mount(storage); await second.comprobarYReconectar(); await flush(); second.sockets[0].open();
  assert.equal(second.sockets[0].sent.length, 0);
  second.enCanalRef.current = true; second.sockets[0].close();
  await second.runTimers(3000); second.sockets[1].open();
  assert.equal(second.sockets[1].sent[0].clienteId, id);
  assert.equal(second.sockets[1].sent[0].emisor, 'Andrés Cruz'); second.unmount();
});
test('concurrent connects share one socket; reconnect restores channel once', async () => {
  const app = mount();
  app.enCanalRef.current = true; app.canalActivoRef.current = 'Canal 1';
  await Promise.all([app.conectarWebSocket('Juan Soto'), app.conectarWebSocket('Juan Soto')]);
  assert.equal(app.sockets.length, 1); app.sockets[0].open();
  assert.equal(app.sockets[0].sent.length, 1);
  assert.equal(app.sockets[0].sent[0].sala, 'Canal 1');
  app.sockets[0].close(); await app.runTimers(3000); app.sockets[1].open();
  assert.equal(app.sockets[1].sent[0].clienteId, app.sockets[0].sent[0].clienteId);
  app.salirDelCanal(); app.sockets[1].close(); await app.runTimers(3000); app.sockets[2].open();
  assert.equal(app.sockets[2].sent.length, 0); app.unmount();
});
test('stale callbacks and wrong-channel lists cannot change current presence', async () => {
  const app = mount(); app.enCanalRef.current = true;
  await app.conectarWebSocket('Juan Soto'); const old = app.sockets[0]; old.open();
  const staleMessage = old.onmessage, staleClose = old.onclose;
  old.close(); await app.runTimers(3000); const current = app.sockets[1]; current.open();
  const clienteId = current.sent[0].clienteId;
  const message = (sala, usuarios) => ({ data: JSON.stringify({ type: 'lista_usuarios', sala, usuarios }) });
  await current.onmessage(message('General', [{ nombre: 'Juan Soto', clienteId }, { nombre: 'Juan Soto', clienteId: 'other-phone' }]));
  assert.equal(app.state.connectedUsers.length, 1);
  await current.onmessage(message('Canal 2', []));
  await staleMessage(message('General', [])); staleClose({ code: 1006 });
  assert.equal(app.state.connectedUsers.length, 1);
  assert.equal(app.ws.current, current); app.unmount();
});
test('pending storage work and pending reconnect stop on unmount', async () => {
  const app = mount(); const pending = app.comprobarYReconectar(); app.unmount();
  await pending; await flush(); assert.equal(app.sockets.length, 0);
  const other = mount(); await other.conectarWebSocket('Juan Soto'); other.sockets[0].open();
  other.sockets[0].close(); other.unmount(); await other.runTimers(3000);
  assert.equal(other.sockets.length, 1);
});
test('replacement close code never schedules reconnect; transport errors do', async () => {
  const app = mount(); await app.conectarWebSocket('Juan Soto'); app.sockets[0].open();
  app.sockets[0].close(4001); await app.runTimers(3000); assert.equal(app.sockets.length, 1); app.unmount();
  const other = mount(); await other.conectarWebSocket('Juan Soto'); other.sockets[0].open();
  other.sockets[0].onerror(); await other.runTimers(3000); assert.equal(other.sockets.length, 2); other.unmount();
});
