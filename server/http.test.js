import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const temp=mkdtempSync(join(tmpdir(),'rate-limiter-test-'))
process.env.DATABASE_PATH=join(temp,'test.sqlite')
process.env.NODE_ENV='test'
const {app,db}=await import('./index.js')

test('gateway authenticates, enforces, persists, emits headers, and revokes',async(t)=>{
  const server=app.listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(temp,{recursive:true,force:true})})
  const base=`http://127.0.0.1:${server.address().port}/api`
  const call=async(path,options={})=>{const response=await fetch(base+path,options);return {response,body:await response.json()}}

  const missing=await call('/gateway/test',{method:'POST'})
  assert.equal(missing.response.status,401)

  const {body:policy}=await call('/policies',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Integration policy',algorithm:'fixed_window',limit:2,window_ms:60000})})
  const {body:created}=await call('/keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Temporary test key'})})
  const secret=created.secret
  assert.match(secret,/^sk_live_/)
  const attached=await call(`/keys/${created.key.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({policy_id:policy.id})})
  assert.equal(attached.response.status,200)

  const headers={Authorization:`Bearer ${secret}`}
  const first=await call('/gateway/test',{method:'POST',headers})
  const second=await call('/gateway/test',{method:'POST',headers})
  const blocked=await call('/gateway/test',{method:'POST',headers})
  assert.equal(first.response.status,200)
  assert.equal(second.response.status,200)
  assert.equal(blocked.response.status,429)
  assert.ok(Number(blocked.response.headers.get('Retry-After'))>=1)
  assert.match(blocked.response.headers.get('RateLimit-Policy'),/q=2/)
  assert.match(blocked.response.headers.get('RateLimit'),/r=0/)
  assert.equal(blocked.response.headers.get('X-RateLimit-Remaining'),'0')
  assert.ok(Number(blocked.response.headers.get('X-RateLimit-Reset'))>=1)
  assert.ok(blocked.body.retry_after)

  const metrics=await call('/metrics/summary')
  assert.equal(metrics.body.total,3)
  assert.equal(metrics.body.allowed,2)
  assert.equal(metrics.body.blocked,1)
  const replay=await call('/lab/replay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key_id:created.key.id,policy_id:policy.id})})
  assert.equal(replay.body.mode,'historical_replay')
  assert.equal(replay.body.mutatesProduction,false)
  assert.equal(replay.body.events_sampled,3)
  assert.equal(replay.body.replay_allowed,2)
  assert.equal(replay.body.replay_blocked,1)
  assert.equal((await call('/requests')).body.length,3)
  const listed=await call('/keys')
  assert.equal(JSON.stringify(listed.body).includes(secret),false)
  assert.equal(JSON.stringify(listed.body).includes('key_hash'),false)

  const rule=await call('/alerts/rules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Blocked threshold',metric:'blocked_requests',threshold:2,window_ms:60000})})
  assert.equal(rule.response.status,201)
  await call('/gateway/test',{method:'POST',headers})
  await call('/gateway/test',{method:'POST',headers})
  const alerts=await call('/alerts')
  assert.equal(alerts.body.length,1)
  assert.ok(alerts.body[0].actual>=2)
  const ack=await call(`/alerts/${alerts.body[0].id}/acknowledge`,{method:'POST'})
  assert.equal(ack.response.status,200)
  assert.equal((await call('/alerts')).body[0].acknowledged,true)

  const revoked=await call(`/keys/${created.key.id}/revoke`,{method:'POST'})
  assert.equal(revoked.response.status,200)
  const afterRevoke=await call('/gateway/test',{method:'POST',headers})
  assert.equal(afterRevoke.response.status,401)
})
