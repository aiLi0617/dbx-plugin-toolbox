import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compile } from 'svelte/compiler';
import { totpLabels } from '../src/lib/totpStore.js';
import { parseTotpConfig } from '../src/lib/codec.js';
const source = readFileSync(new URL('../src/lib/TotpView.svelte', import.meta.url), 'utf8');
const ast = parse(source, { modern: true });
const handlers = ast.instance.content.body.filter(n => n.type === 'FunctionDeclaration').map(n => source.slice(n.start,n.end)).join('\n');
const mountNode=ast.instance.content.body.find(n=>n.type==='ExpressionStatement'&&n.expression?.callee?.name==='onMount').expression.arguments[0];
const mountBody=source.slice(mountNode.body.start+1,mountNode.body.end-1);
function view(initial = {}, rpc = async () => ({}), browser = {dispatchEvent(){}}, timers = {}) {
  const state = { locale:'en', secret:'', digits:'6', step:'30', algorithm:'SHA-1', windows:[], effectiveConfig:null, error:'', formatError:false, generating:false, savedExists:false, savedUnlocked:false, savedEntries:[], selectedId:'', storePassword:'', confirmPassword:'', storeError:'', saveName:'', saveNote:'', saveIssuer:'', saveAccount:'', saveError:'', editError:'', saving:false, busy:false, storeReady:true, protection:'vault', unlockOpen:false, saveOpen:false, showSecret:false, query:'', managing:false, editing:null, pendingDelete:null, deleteError:'', infoMode:'', dragId:'', dragTargetId:'', revealedSecret:'', revealBusy:false, revealError:'', revealTimer:undefined, revealVersion:0, disposed:false, revision:0, ...initial };
  return new Function('state','invoke','totpLabels','parseTotpConfig','window','onVaultChange','setInterval','clearInterval', `
    ${Object.keys(state).map(k => `let ${k} = state.${k};`).join('\n')}
    const t = (zh,en) => en; const localizeError = (locale,e) => 'localized:' + e.message;
    ${handlers}
    return {mount:()=>{${mountBody}},unlockSaved,retrySaved,manualInput,beginSave,beginEdit,cancelAccount,validateDraft,saveCurrent,selectSaved,deleteSaved,updateSaved,moveSaved,clearSensitive,refreshSaved,
    read: () => ({${Object.keys(state).join(',')}})};
  `)(state,rpc,totpLabels,parseTotpConfig,browser,()=>{},timers.setInterval||setInterval,timers.clearInterval||clearInterval);
}

test('TOTP labels decode issuer/account without including secret query data', () => {
  const uri='otpauth://totp/Example%3Auser%40test.com?issuer=Override&secret=JBSWY3DPEHPK3PXP&digits=8&period=60&algorithm=SHA256';
  assert.deepEqual(totpLabels(uri), {issuer:'Override',account:'user@test.com'});
  const config=parseTotpConfig(uri);
  assert.equal(config.digits,8); assert.equal(config.step,60); assert.equal(config.algorithm,'SHA-256');
  assert.deepEqual(totpLabels('otpauth://hotp/Test?secret=hidden'),{issuer:'',account:''});
  assert.deepEqual(totpLabels('otpauth://totp/%zz?secret=hidden'),{issuer:'',account:''});
});
test('saved accounts use the shared vault without selecting an account automatically', async () => {
  const form=view({},async method=>method.endsWith('/status')?{exists:true,unlocked:true,protection:'vault'}:{entries:[{id:'first'}]});
  await form.refreshSaved(); assert.equal(form.read().selectedId,''); assert.equal(form.read().savedUnlocked,true);
});

test('creating and unlocking TOTP uses the unified vault and clears both password fields', async () => {
  for(const exists of [false,true]) {
    const calls=[];
    const form=view({savedExists:exists,storePassword:'test-password',confirmPassword:'test-password'},async(method,params)=>{
      calls.push({method,params});return method.endsWith('/status')?{exists:true,unlocked:true,protection:'vault'}:{entries:[]};
    });
    await form.unlockSaved();assert.equal(calls[0].method,exists?'toolbox/keys/unlock':'toolbox/keys/setup');
    assert.deepEqual(calls[0].params,{password:'test-password'});
    assert.equal(form.read().storePassword,'');assert.equal(form.read().confirmPassword,'');assert.equal(form.read().savedUnlocked,true);
  }
});

test('wrong password preserves the unlock flow without retaining passwords', async () => {
  const form=view({savedExists:true,unlockOpen:true,storePassword:'wrong-password'},async()=>{throw Error('Wrong password');});
  await form.unlockSaved();assert.equal(form.read().storePassword,'');assert.equal(form.read().savedUnlocked,false);
  assert.equal(form.read().unlockOpen,true);assert.match(form.read().storeError,/localized/);
});

test('saving while locked requests unlock before opening the account form', () => {
  const form=view({secret:'JBSWY3DPEHPK3PXP'});form.beginSave();
  assert.equal(form.read().unlockOpen,true);assert.equal(form.read().saveOpen,false);
});

test('a locked vault refresh immediately clears saved codes, selection, revealed material and drafts', async () => {
  const form=view({savedUnlocked:true,selectedId:'a',revealedSecret:'private',secret:'temporary',windows:[{code:'123456'}],editing:{id:'a'},storePassword:'private',confirmPassword:'private',saveNote:'private'},async()=>({exists:true,unlocked:false,protection:'vault'}));
  await form.refreshSaved();const state=form.read();
  for(const key of ['selectedId','revealedSecret','secret','storePassword','confirmPassword','saveNote'])assert.equal(state[key],'',key);
  assert.deepEqual(state.windows,[]);assert.equal(state.editing,null);assert.equal(state.savedUnlocked,false);assert.equal(state.savedExists,true);
});

test('TOTP save sends URI configuration once and then uses only saved ID', async () => {
  const calls=[];
  const form=view({savedUnlocked:true,secret:'otpauth://totp/Example:user?secret=JBSWY3DPEHPK3PXP&digits=8&period=60'}, async(method,params)=>{
    calls.push({method,params:structuredClone(params)});
    if(method.endsWith('/save')) return {entry:{id:'saved-id'}};
    if(method.endsWith('/status')) return {exists:true,unlocked:true,protection:'vault'};
    return {entries:[{id:'saved-id',name:'user'}]};
  });
  form.beginSave(); await form.saveCurrent();
  assert.deepEqual(calls[0].params,{name:'user',note:'',issuer:'Example',account:'user',secret:'JBSWY3DPEHPK3PXP',digits:8,period:60,algorithm:'SHA-1'});
  assert.equal(form.read().secret,''); assert.equal(form.read().selectedId,'saved-id');
  assert.ok(!calls.slice(1).some(c=>JSON.stringify(c.params || {}).includes('JBSWY')));
});
test('late TOTP save responses cannot restore secrets or selection after page cleanup',async()=>{
  let resolve;
  const form=view({savedUnlocked:true,secret:'JBSWY3DPEHPK3PXP'},()=>new Promise(r=>resolve=r));
  form.beginSave();
  const pending=form.saveCurrent();
  form.clearSensitive(); resolve({entry:{id:'late'}}); await pending;
  assert.equal(form.read().secret,''); assert.equal(form.read().selectedId,'');
});
test('TOTP changes retain secret in Sidecar and cleanup clears codes, passwords and metadata',async()=>{
  let request;
  const form=view({editing:{id:'id',name:'Renamed',issuer:'Example',account:'user'},windows:[{code:'123456'}],storePassword:'password',showSecret:true},async(method,params)=>{
    if(method.endsWith('/save')) request=params;
    if(method.endsWith('/status')) return {exists:true,unlocked:true,protection:'vault'};
    return {entries:[]};
  });
  await form.updateSaved(); assert.deepEqual(request,{id:'id',name:'Renamed',issuer:'Example',account:'user',note:''});
  form.clearSensitive(); const state=form.read();
  assert.equal(state.storePassword,''); assert.deepEqual(state.windows,[]); assert.deepEqual(state.savedEntries,[]);
});
test('TOTP deletion and ordering use IDs and prevent duplicate mutations',async()=>{
  const entries=[{id:'a'},{id:'b'}], calls=[];
  const form=view({savedEntries:entries,pendingDelete:entries[0],selectedId:'a'},async(method,params)=>{
    calls.push({method,params}); if(method.endsWith('/status')) return {exists:true,unlocked:true,protection:'vault'}; return {entries};
  });
  await form.moveSaved(0,1); assert.deepEqual(calls[0].params,{ids:['b','a']});
  await form.deleteSaved(); assert.equal(form.read().selectedId,'');
  const blocked=view({busy:true,pendingDelete:entries[0]},async()=>{throw Error('should not call');});
  await blocked.deleteSaved(); assert.ok(blocked.read().pendingDelete);
});
test('save dialog retains name and note on failure and prevents duplicate submissions', async()=>{
  const calls=[];
  const form=view({savedUnlocked:true,secret:'JBSWY3DPEHPK3PXP',saveName:'Personal',saveNote:'First line\nSecond line',saveOpen:true},async(method,params)=>{
    calls.push({method,params}); throw Error('Unavailable');
  });
  await form.saveCurrent();
  assert.equal(calls[0].params.note,'First line\nSecond line');
  assert.equal(form.read().saveName,'Personal'); assert.equal(form.read().saveNote,'First line\nSecond line');
  assert.equal(form.read().saveOpen,true); assert.match(form.read().saveError,/localized/);
  const blocked=view({saving:true,saveOpen:true,saveName:'Keep',saveNote:'Keep'},async()=>{throw Error('should not call');});
  blocked.cancelAccount(); await blocked.saveCurrent(); assert.equal(blocked.read().saveOpen,true);
  form.cancelAccount(); assert.equal(form.read().saveName,''); assert.equal(form.read().saveNote,''); assert.equal(form.read().saveOpen,false);
});
test('edit dialog preserves notes and displays failed updates inside the dialog', async()=>{
  const form=view({},async()=>{throw Error('Unavailable');});
  form.beginEdit({id:'a',name:'Name',issuer:'Issuer',account:'user',note:'Private note'});
  await form.updateSaved();
  assert.equal(form.read().editing.note,'Private note'); assert.match(form.read().editError,/localized/); assert.equal(form.read().storeError,'');
  form.clearSensitive(); assert.equal(form.read().editing,null); assert.equal(form.read().saveNote,''); assert.equal(form.read().editError,'');
});
test('name and note validation accepts Unicode and multiline text, rejects invalid drafts before RPC', async()=>{
  const form=view({saveName:'',saveNote:'',secret:'JBSWY3DPEHPK3PXP'},async()=>{throw Error('should not call');});
  assert.equal(form.validateDraft('😀'.repeat(128),'Line 1\nLine 2'),'');
  assert.notEqual(form.validateDraft('😀'.repeat(129),''),'');
  assert.notEqual(form.validateDraft('Name','x'.repeat(501)),'');
  assert.notEqual(form.validateDraft('Name','x\u0000y'),'');
  await form.saveCurrent(); assert.match(form.read().saveError,/name is required/);
});
test('a list refresh failure after saving keeps the saved account visible and does not invite duplicate saves', async()=>{
  const form=view({savedUnlocked:true,secret:'JBSWY3DPEHPK3PXP',saveName:'Saved',saveNote:'Note',saveOpen:true},async method=>{
    if(method.endsWith('/save'))return {entry:{id:'persisted',name:'Saved',note:'Note'}};
    throw Error('List unavailable');
  });
  await form.saveCurrent();
  const state=form.read();
  assert.equal(state.selectedId,'persisted'); assert.equal(state.savedEntries[0].note,'Note');
  assert.equal(state.secret,''); assert.equal(state.saveOpen,false); assert.equal(state.saveError,'');
  assert.match(state.storeError,/List unavailable/);
});
test('TOTP component compiles and preserves the storage and lifecycle boundary',()=>{
  compile(source,{filename:'TotpView.svelte',generate:'client'});
  assert.doesNotMatch(source,/localStorage|sessionStorage|console\./);
  assert.match(source,/onDestroy\(\(\) => \{ disposed = true; clearSensitive\(\);/);
  assert.match(source,/toolbox\/totp\/generate", \{ id: idSnapshot \}/);
  assert.match(source,/toolbox-workbench-lock/);
  // DBX permits scripts but omits allow-forms: native submits never reach handlers.
  assert.doesNotMatch(source,/<form\b|type="submit"/);
});

test('shared lock events clear sensitive state synchronously and late account lists cannot restore it', async () => {
  const listeners=new Map();let resolveList;
  const browser={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const form=view({savedUnlocked:true,selectedId:'a',revealedSecret:'private',secret:'temporary',windows:[{code:'123456'}]},async method=>method.endsWith('/status')?{exists:true,unlocked:true,protection:'vault'}:new Promise(resolve=>resolveList=resolve),browser,{setInterval:()=>1,clearInterval(){}});
  const cleanup=form.mount();await Promise.resolve();
  listeners.get('toolbox-vault-change')({detail:{unlocked:false}});
  assert.equal(form.read().selectedId,'');assert.equal(form.read().revealedSecret,'');assert.deepEqual(form.read().windows,[]);
  resolveList({entries:[{id:'a'}]});await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(form.read().savedEntries,[]);cleanup();assert.equal(listeners.size,0);
});

test('polling detects an external lock without user activity and stops on teardown', async () => {
  let unlocked=true,tick,cleared=false;
  const browser={addEventListener(){},removeEventListener(){}};
  const form=view({savedUnlocked:true,selectedId:'a',revealedSecret:'private'},async method=>method.endsWith('/status')?{exists:true,unlocked,protection:'vault'}:{entries:[{id:'a'}]},browser,{setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{cleared=true;}});
  const cleanup=form.mount();await new Promise(resolve=>setImmediate(resolve));unlocked=false;await tick();
  assert.equal(form.read().savedUnlocked,false);assert.equal(form.read().revealedSecret,'');assert.equal(form.read().selectedId,'');
  cleanup();assert.equal(cleared,true);
});

test('workbench auto-lock locks the shared vault and broadcasts immediate sensitive-state cleanup', async () => {
  const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
  const nodes=parse(app,{modern:true}).instance.content.body.filter(n=>n.type==='FunctionDeclaration'&&['clearVaultLockTimer','enforceVaultAutoLock'].includes(n.id.name));
  const calls=[],events=[];
  const run=new Function('invoke','window',`let vaultUnlocked=true,vaultAutoLockMinutes=1,vaultLastActivityAt=1,vaultLockTimer;function scheduleVaultAutoLock(){throw Error('should lock now')}async function refreshKeys(){throw Error('unexpected refresh')}${nodes.map(n=>app.slice(n.start,n.end)).join('\n')};return enforceVaultAutoLock;`)(async method=>calls.push(method),{dispatchEvent:event=>events.push(event),clearTimeout(){}});
  await run();assert.deepEqual(calls,['toolbox/keys/lock']);
  assert.equal(events[0].type,'toolbox-vault-change');assert.deepEqual(events[0].detail,{unlocked:false});
});
