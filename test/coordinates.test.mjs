import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCoordinates} from '../src/lib/coordinates.js';

test('coordinate entry accepts signed decimal degrees, zero and boundary values', () => {
  assert.deepEqual(parseCoordinates(' 41.83531 ','-87.62700'),{lat:41.83531,lng:-87.627});
  assert.deepEqual(parseCoordinates('0','0'),{lat:0,lng:0});
  assert.deepEqual(parseCoordinates('-90','180'),{lat:-90,lng:180});
  assert.deepEqual(parseCoordinates('+90','-180'),{lat:90,lng:-180});
});
test('coordinate entry rejects missing, malformed and out-of-range coordinates', () => {
  for(const [lat,lng] of [['','0'],['0',' '],['91','0'],['-90.1','0'],['0','181'],['0','-180.1'],['NaN','0'],['Infinity','0'],['0x20','0'],['41,8','0'],['1e2','0'],['41N','0']]) {
    assert.throws(()=>parseCoordinates(lat,lng));
  }
});
