import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonStructureDiff } from '../src/lib/developerExpansion.js';
import { stringifyLosslessJson } from '../src/lib/jsonPrecision.js';
import { compareBenchmarks } from '../src/lib/calculators.js';
import { createPdfSessionPool } from '../src/lib/pdfSessionPool.js';
import { constrainCrop } from '../src/lib/cropGeometry.js';
import { shouldTrackEdit, resultSignature, resultIsCurrent } from '../src/lib/sessionInteractions.js';
import { createSessionState } from '../src/lib/sessionState.js';

test('file input before first import does not manufacture unsaved content; existing content stays protected',()=>{
  const state=createSessionState();
  const fileEvent={target:{type:'file',closest:()=>null}};
  if(shouldTrackEdit(fileEvent))state.update('pdf',{dirty:true});
  assert.equal(state.protected('pdf'),false);
  state.update('pdf',{dirty:true});
  if(shouldTrackEdit(fileEvent))state.update('pdf',{dirty:true});
  assert.equal(state.protected('pdf'),true);
});
test('results become uncopyable after any parameter changes, including changes during execution',()=>{
  const original=['iban','GB82','',10]; const executed=resultSignature(original);
  assert.equal(resultIsCurrent('result',executed,resultSignature(original)),true);
  for(let i=0;i<original.length;i++){
    const changed=[...original];changed[i]='changed';
    assert.equal(resultIsCurrent('result',executed,resultSignature(changed)),false);
  }
});

test('JSON comparison preserves unsafe integers, exponents and numeric equivalence',()=>{
  assert.equal(jsonStructureDiff('{"n":1}','{"n":1e0}').length,0);
  assert.equal(jsonStructureDiff('{"n":1.0}','{"n":1}').length,0);
  assert.equal(jsonStructureDiff('-0','0e999').length,0);
  assert.equal(jsonStructureDiff('10e9007199254740992','1e9007199254740993').length,0);
  for(const [a,b] of [['9007199254740992','9007199254740993'],['1e999','2e999'],['1e9007199254740992','1e9007199254740993']]) {
    const rows=jsonStructureDiff(`{"n":${a}}`,`{"n":${b}}`);
    assert.equal(rows.length,1);
    const copy=stringifyLosslessJson(rows);
    assert.ok(copy.includes(a));assert.ok(copy.includes(b));
    assert.equal(rows[0].path,'/n');
  }
});
test('benchmark ranking follows selected metric and defaults to throughput',()=>{
  const input='A: 100, 120\nB: 50, 60';
  assert.equal(compareBenchmarks(input)[0].name,'A');
  const rows=compareBenchmarks(input,{metric:'latency'});
  assert.equal(rows[0].name,'B');assert.equal(rows[0].relativeToFastest,1);assert.equal(rows[1].relativeToFastest,.5);
});
test('PDF pool refuses unsaved/running sessions, preserves occupancy and waits for release',async()=>{
  const pool=createPdfSessionPool(1);let safe=false,released=false;
  const lease=await pool.acquire('one',{canRelease:()=>safe,release:async()=>{await Promise.resolve();released=true;}});lease.attach('1');
  await assert.rejects(pool.acquire('two'),error=>error.code==='PDF_SESSION_LIMIT' && error.occupants[0]==='one');
  safe=true;const second=await pool.acquire('two');assert.ok(released);assert.deepEqual(pool.owners(),['two']);second.abandon();assert.deepEqual(pool.owners(),[]);
});
test('PDF pool serializes concurrent admissions and retains failed cleanup',async()=>{
  const pool=createPdfSessionPool(1);
  const settled=await Promise.allSettled([pool.acquire('one'),pool.acquire('two')]);
  assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
  settled[0].value.abandon();
  const lease=await pool.acquire('bad',{canRelease:()=>true,release:async()=>{throw new Error('cleanup failed')}});lease.attach('bad');
  await assert.rejects(pool.acquire('next'),/cleanup failed/);assert.deepEqual(pool.owners(),['bad']);
});
test('crop coordinates remain integer source pixels inside image boundaries',()=>{
  assert.deepEqual(constrainCrop({x:95,y:-2,width:30,height:300},100,80),{x:70,y:0,width:30,height:80});
  assert.deepEqual(constrainCrop({x:2.7,y:3.2,width:0,height:NaN},100,80),{x:3,y:0,width:1,height:80});
});
