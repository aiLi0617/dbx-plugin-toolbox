import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse,compile} from 'svelte/compiler';
const source=readFileSync(new URL('../src/lib/TotpView.svelte',import.meta.url),'utf8');
const names=new Set(['hideSavedSecret','revealSavedSecret','dropSaved','startDrag']);
const code=parse(source,{modern:true}).instance.content.body.filter(n=>n.type==='FunctionDeclaration'&&names.has(n.id.name)).map(n=>source.slice(n.start,n.end)).join('\n');
test('loading saved accounts starts in manual mode and preserves an explicit selection',async()=>{
 const node=parse(source,{modern:true}).instance.content.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='refreshSaved');
 const load=new Function('invoke','initial',`let selectedId=initial,revision=0,disposed=false,savedExists=false,savedUnlocked=false,protection='',savedEntries=[],storeReady=false;function clearCodes(){};${source.slice(node.start,node.end)};return async()=>{await refreshSaved();return {selectedId,savedEntries}}`);
 const rpc=async method=>method.endsWith('/status')?{exists:true,unlocked:true,protection:'vault'}:{entries:[{id:'first'},{id:'second'}]};
 assert.equal((await load(rpc,'')()).selectedId,'');
 assert.equal((await load(rpc,'second')()).selectedId,'second');
 assert.equal((await load(rpc,'removed')()).selectedId,'');
});
function harness(invoke,mutateSaved=async()=>{},entries=[]){
 return new Function('invoke','mutateSaved',`let selectedId='a',revision=0,disposed=false,revealVersion=0,revealTimer,revealedSecret='',revealBusy=false,revealError='',storeError='',locale='en',dragId='a',busy=false,saving=false,savedEntries=${JSON.stringify(entries)};const t=(zh,en)=>en;const localizeError=(l,e)=>e.message;${code};return {hideSavedSecret,revealSavedSecret,dropSaved,read:()=>({revealedSecret,revealBusy,revealError})}`)(invoke,mutateSaved);
}
test('saved secret is requested explicitly and late reveal cannot restore hidden data',async()=>{
 let resolve;const calls=[];
 const h=harness((method,p)=>{calls.push({method,p});return new Promise(r=>resolve=r)});
 assert.equal(calls.length,0);const pending=h.revealSavedSecret();
 assert.deepEqual(calls,[{method:'toolbox/totp/reveal',p:{id:'a'}}]);
 h.hideSavedSecret();resolve({secret:'EXAMPLE'});await pending;
 assert.equal(h.read().revealedSecret,'');
});
test('revealed secret can be hidden and errors never replace the mask with stale data',async()=>{
 const h=harness(async()=>({secret:'EXAMPLE'}));await h.revealSavedSecret();
 assert.equal(h.read().revealedSecret,'EXAMPLE');h.hideSavedSecret();assert.equal(h.read().revealedSecret,'');
 const failed=harness(async()=>{throw Error('Locked')});await failed.revealSavedSecret();
 assert.equal(failed.read().revealedSecret,'');assert.equal(failed.read().revealError,'Locked');
});
test('drag ordering submits the complete list and ignores same-item drops',async()=>{
 const calls=[];const h=harness(async()=>{},async(...args)=>calls.push(args),[{id:'a'},{id:'b'},{id:'c'}]);
 await h.dropSaved({preventDefault(){}},'c');
 assert.deepEqual(calls,[['reorder',{ids:['b','a','c']}]]);
 const same=harness(async()=>{},async()=>{throw Error('unexpected')},[{id:'a'}]);
 await same.dropSaved({preventDefault(){}},'a');
});
test('missing reveal support gives an actionable inline error instead of silently showing nothing',async()=>{
 for(const rpc of [async()=>({}),async()=>{throw Error('Unknown TOTP operation')}]){
  const h=harness(rpc);await h.revealSavedSecret();
  assert.equal(h.read().revealedSecret,'');assert.match(h.read().revealError,/updated backend/);
 }
});
test('TOTP panel compiles with a fixed height shared by manual and saved modes',()=>{
 compile(source,{generate:'client',filename:'TotpView.svelte'});
 assert.match(source,/\.input-panel\s*\{ height:176px/);
 assert.doesNotMatch(source,/<details class="settings-panel"/);
 assert.match(source,/\.full-note\s*\{[^}]*overflow:auto/);
});
