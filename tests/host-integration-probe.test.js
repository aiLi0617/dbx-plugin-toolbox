import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectHostIntegration} from '../src/lib/hostIntegrationProbe.js';
test('host probes report availability without copying query data, connection details or paths',()=>{
  const result=inspectHostIntegration({context:{result:{columns:['sensitive_column'],rows:[['private-value']],sql:'select private',connectionId:'private-id',truncated:true},path:'private-path'},onContext(){},sendBinary(){}});
  assert.equal(result.resultRowCount,1);assert.equal(result.resultTruncated,true);
  assert.equal(result.desktopInteractionValidated,false);
  assert.doesNotMatch(JSON.stringify(result),/private|sensitive_column|select /);
  assert.equal(inspectHostIntegration(null).bridgeAvailable,false);
});
