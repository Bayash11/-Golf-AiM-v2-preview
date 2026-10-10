'use strict';
/* Executable regression tests against the actual functions embedded in index.html.
 * No app data is altered; storage is a fully in-memory test double.
 * Run with: node --test tests/save-recovery.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
function between(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'Missing app source boundary: ' + start);
  return html.slice(a, b);
}
const implementation = between('async function ny(', 'async function Rg()')
  + '\n' + between('async function Y1(', 'async function Lg(')
  + '\n' + between('const GA_RESTORE_TYPES=', 'function gaRestoreSessionKey(');

function fixture() {
  const map = new Map();
  const pending = new Map();
  let fail = false;
  let attempts = 0;
  const prefix = 'golf-aim:priv:';
  const storage = {
    async get(key) {
      if (!map.has(prefix + key)) throw new Error('Key not found: ' + key);
      return {value: map.get(prefix + key)};
    },
    async set(key, value) {
      attempts++;
      if (fail) throw new Error('QuotaExceededError: storage quota reached');
      map.set(prefix + key, value);
    },
    async delete(key) { map.delete(prefix + key); }
  };
  const sessionStorage = {
    setItem(key, value) { pending.set(key, value); },
    getItem(key) { return pending.get(key) ?? null; },
    removeItem(key) { pending.delete(key); }
  };
  const downloads = [], shares = [];
  class FileMock {
    constructor(parts, name, options) {
      this.contents = parts.join(''); this.name = name; this.type = options.type;
    }
    async text() { return this.contents; }
  }
  const document = {
    body: {appendChild() {}},
    createElement() {
      const item = {remove() {},click() { downloads.push({name: item.download, href: item.href}); }};
      return item;
    }
  };
  const context = vm.createContext({
    window: {storage, sessionStorage, setTimeout(callback) { callback(); }},
    navigator: {canShare() {return true;}, async share(payload) { shares.push(payload); }},
    File: FileMock, Blob, document,
    URL: {createObjectURL() {return 'blob:test';},revokeObjectURL() {}},
    setTimeout(callback, delay) {return setTimeout(callback,Math.min(delay,1));}, console, AH(tag, props, ...children) {return {tag, props, children};},
    gaUseResetViewportOnMount() {}
  });
  vm.runInContext(implementation, context);
  return {
    context, map, pending, downloads, shares, prefix,
    failWrites(value) { fail = value; },
    get attempts() {return attempts;},
    run(expression) {return vm.runInContext(expression, context);},
    async save(kind, data) {
      context.testRecord = data;
      return vm.runInContext('gaPersistSession(' + JSON.stringify(kind) + ',testRecord)', context);
    },
    readRecovery() {return vm.runInContext('gaEmergencyRead()', context);}
  };
}
function course(id) {return {sessionId:id,date:'2026/10/10',holes:[{number:1,par:4,total:5}]};}
function random(id) {return {sessionId:id,date:'2026/10/10',shots:[{club:'7I',forward:145}]};}
function readHistory(f, key) {return JSON.parse(f.map.get(f.prefix + key));}

test('course succeeds on a fresh device and preserves full data', async () => {
  const f = fixture(), record=course('new-course');
  const result=await f.save('course', record);
  assert.equal(result.ok,true);
  assert.deepEqual(readHistory(f,'round-history'),[record]);
});
test('random succeeds and another existing session stays intact', async () => {
  const f=fixture(), old=random('old'), current=random('new');
  f.map.set(f.prefix+'random10-sessions',JSON.stringify([old]));
  const result=await f.save('random',current);
  assert.equal(result.ok,true);
  assert.deepEqual(readHistory(f,'random10-sessions'),[current,old]);
});
test('retrying the same session does not duplicate records', async () => {
  const f=fixture(), original=random('repeated');
  f.map.set(f.prefix+'random10-sessions',JSON.stringify([original,random('other')]));
  assert.equal((await f.save('random',original)).ok,true);
  assert.equal(readHistory(f,'random10-sessions').length,2);
});
test('quota failure leaves existing records unchanged and reports an error', async () => {
  const f=fixture(), old=course('existing');
  f.map.set(f.prefix+'round-history',JSON.stringify([old]));
  f.failWrites(true);
  const result=await f.save('course',course('unsaved'));
  assert.equal(result.ok,false);
  assert.match(result.error,/QuotaExceededError/);
  assert.equal(f.attempts,3);
  assert.deepEqual(readHistory(f,'round-history'),[old]);
});
test('retry after quota is lifted saves the original session', async () => {
  const f=fixture(), record=random('recover-me');
  f.failWrites(true);
  assert.equal((await f.save('random',record)).ok,false);
  f.failWrites(false);
  assert.equal((await f.save('random',record)).ok,true);
  assert.deepEqual(readHistory(f,'random10-sessions'),[record]);
});
test('corrupt existing history blocks writes rather than silently overwriting', async () => {
  const f=fixture();
  f.map.set(f.prefix+'round-history','{broken-json');
  const result=await f.save('course',course('new'));
  assert.equal(result.ok,false);
  assert.equal(f.attempts,0);
  assert.equal(f.map.get(f.prefix+'round-history'),'{broken-json');
});
test('50-course and 100-random limits fail safely without deleting old data', async () => {
  const f=fixture();
  f.map.set(f.prefix+'round-history',JSON.stringify(Array.from({length:50},(_,i)=>course('c'+i))));
  f.map.set(f.prefix+'random10-sessions',JSON.stringify(Array.from({length:100},(_,i)=>random('r'+i))));
  assert.equal((await f.save('course',course('new'))).ok,false);
  assert.equal((await f.save('random',random('new'))).ok,false);
  assert.equal(readHistory(f,'round-history').length,50);
  assert.equal(readHistory(f,'random10-sessions').length,100);
  assert.equal(f.attempts,0);
});
test('pending record survives same-tab reload through sessionStorage', () => {
  const f=fixture(), entry={kind:'course',record:course('pending'),destination:'result',round:{holes:[{}]}};
  f.context.entry=entry;
  assert.equal(f.run('gaEmergencyStore(entry)'),true);
  const restored=f.readRecovery();
  assert.equal(restored.record.sessionId,'pending');
  assert.equal(restored.temporarySaved,true);
});
test('pending storage failure is observable without damaging original record', () => {
  const f=fixture(), record=random('memory-only');
  f.context.entry={kind:'random',record,destination:'quit'};
  f.context.window.sessionStorage.setItem=()=>{throw new Error('storage denied')};
  assert.equal(f.run('gaEmergencyStore(entry)'),false);
  assert.equal(f.context.entry.record.sessionId,'memory-only');
});
test('shared emergency JSON is accepted by the existing backup parser', async () => {
  const f=fixture(), record=course('emergency-share');
  f.context.entry={kind:'course',record,destination:'quit'};
  const result=await f.run('gaEmergencyExport(entry,true)');
  assert.equal(result.status,'shared');
  assert.equal(f.shares.length,1);
  const raw=await f.shares[0].files[0].text();
  const doc=JSON.parse(raw);
  assert.equal(doc.format,'golf-aim-localstorage-backup');
  assert.deepEqual(JSON.parse(doc.storage[f.prefix+'round-history']),[record]);
  f.context.testJson=raw;
  const parsed=f.run('gaRestoreParseText(testJson)');
  assert.ok(parsed.values[f.prefix+'round-history']);
});
test('direct download works without localStorage and names the JSON file', async () => {
  const f=fixture();
  f.context.entry={kind:'random',record:random('emergency-download'),destination:'result'};
  const result=await f.run('gaEmergencyExport(entry,false)');
  assert.equal(result.status,'download');
  assert.match(result.filename,/^GOLF-AiM-emergency-\d{8}-\d{4}\.json$/);
  assert.equal(f.downloads.length,1);
  assert.equal(f.downloads[0].href,'blob:test');
});
test('cancelled share does not pretend a backup was exported', async () => {
  const f=fixture();
  f.context.entry={kind:'course',record:course('share-cancel'),destination:'quit'};
  f.context.navigator.share=async()=>{const e=new Error('cancel');e.name='AbortError';throw e;};
  const result=await f.run('gaEmergencyExport(entry,true)');
  assert.equal(result.status,'cancelled');
});
test('four completion paths check save result before clearing active sessions', () => {
  assert.equal((html.match(/gaEnterRecovery\("course"/g)||[]).length,2);
  assert.equal((html.match(/gaEnterRecovery\("random"/g)||[]).length,2);
  for(const fragment of [
    'gaEnterRecovery("course",j,"quit"',
    'gaEnterRecovery("random",E,"quit"',
    'gaEnterRecovery("random",Zt,"result"',
    'gaEnterRecovery("course",Zt[0],"result"'
  ])assert.ok(html.includes(fragment),'Missing protection: '+fragment);
});
