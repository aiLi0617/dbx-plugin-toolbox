import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, sessionVictim } from '../src/lib/sessionState.js';
import { SIMPLE_TOOL_IDS, BACKGROUND_TOOL_IDS, EPHEMERAL_TOOL_IDS } from '../src/lib/viewRegistry.js';

test('PDF sessions stay mounted across navigation, including password operations', () => {
  for (const id of ['pdf-merge','pdf-watermark','pdf-encrypt','pdf-decrypt']) {
    assert.equal(BACKGROUND_TOOL_IDS.has(id),true,id);
    assert.equal(EPHEMERAL_TOOL_IDS.has(id),false,id);
  }
});

test('session eviction protects edits, active work and unsaved results', () => {
  const state=createSessionState(), ids=Array.from({length:8},(_,i)=>String(i));
  ids.forEach(id=>state.update(id,{dirty:true}));
  assert.equal(sessionVictim(ids,state,new Set()),false);
  state.update('3',{dirty:false});
  assert.equal(sessionVictim(ids,state,new Set()),'3');
  state.update('3',{busy:true});
  assert.equal(sessionVictim(ids,state,new Set()),false);
  assert.equal(sessionVictim([...ids,'pdf'],state,new Set(['pdf','7'])),null);
});
test('cancelled and failed exports retain work; successful exports clear unsaved flags', async () => {
  const state=createSessionState();
  state.update('tool',{dirty:true,hasUnsavedResult:true,export:async()=>({cancelled:true})});
  assert.equal(await state.export('tool'),false); assert.equal(state.protected('tool'),true);
  state.update('tool',{export:async()=>{throw new Error('disk full');}});
  await assert.rejects(state.export('tool')); assert.equal(state.protected('tool'),true);
  state.update('tool',{export:async()=>true});
  assert.equal(await state.export('tool'),true); assert.equal(state.protected('tool'),false);
});
test('session snapshots never contain execution functions or content', () => {
  const state=createSessionState();let snapshot;
  state.subscribe(value=>snapshot=value);
  state.update('tool',{dirty:true,export:()=> 'private-payload',retry:()=>{}});
  assert.doesNotMatch(JSON.stringify(snapshot),/private-payload|content|secret/);
  assert.equal(snapshot.tool.canExport,true);
  state.discard('tool'); assert.deepEqual(snapshot,{});
});
test('workbench resources release once even if page teardown follows global cleanup', () => {
  const state=createSessionState();let releases=0,snapshot;
  state.subscribe(value=>snapshot=value);
  state.update('pdf',{dispose:()=>releases++,hasUnsavedResult:true});
  assert.equal('dispose' in snapshot.pdf,false);
  state.releaseAll();state.discard('pdf');
  assert.equal(releases,1);
});
test('established utilities bypass the additional editing and transfer controls', () => {
  assert.deepEqual([...SIMPLE_TOOL_IDS], ['json','data-convert','spreadsheet','whitespace','regex','base64','image-ocr']);
});
