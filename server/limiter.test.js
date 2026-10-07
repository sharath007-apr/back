import test from 'node:test'
import assert from 'node:assert/strict'
import { decide, clearStates } from './limiter.js'

const policy=(algorithm,limit=2)=>({id:algorithm,name:'test',algorithm,limit,window_ms:1000,burst_capacity:limit,refill_rate:limit})

for(const algorithm of ['fixed_window','sliding_log','sliding_counter','token_bucket','leaky_bucket']){
  test(`${algorithm} allows within capacity and rejects excess`,()=>{
    clearStates()
    const p=policy(algorithm)
    assert.equal(decide(p,'key',1000).allowed,true)
    assert.equal(decide(p,'key',1001).allowed,true)
    const rejected=decide(p,'key',1002)
    assert.equal(rejected.allowed,false)
    assert.ok(rejected.retryAfterMs>0)
    assert.equal(rejected.remaining,0)
  })
}

test('fixed window resets on a window boundary',()=>{
  clearStates();const p=policy('fixed_window',1)
  assert.equal(decide(p,'key',1000).allowed,true)
  assert.equal(decide(p,'key',1500).allowed,false)
  assert.equal(decide(p,'key',2000).allowed,true)
})

test('sliding log expires requests outside the rolling window',()=>{
  clearStates();const p=policy('sliding_log',1)
  assert.equal(decide(p,'key',1000).allowed,true)
  assert.equal(decide(p,'key',1500).allowed,false)
  assert.equal(decide(p,'key',2001).allowed,true)
})

test('independent keys have independent state',()=>{
  clearStates();const p=policy('fixed_window',1)
  assert.equal(decide(p,'a',1000).allowed,true)
  assert.equal(decide(p,'b',1000).allowed,true)
  assert.equal(decide(p,'a',1001).allowed,false)
})
