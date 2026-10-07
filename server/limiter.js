import { randomUUID } from 'node:crypto'

const states = new Map()
export const algorithms = ['token_bucket','leaky_bucket','fixed_window','sliding_log','sliding_counter']

export function decide(policy, keyId, now = Date.now()) {
  const stateKey = `${keyId}:${policy.id}`
  const s = states.get(stateKey) ?? {}
  const limit = policy.limit, window = policy.window_ms
  let allowed = false, remaining = 0, resetAt = now + window, retryMs = window
  if (policy.algorithm === 'fixed_window') {
    const start = Math.floor(now / window) * window
    if (s.start !== start) { s.start = start; s.count = 0 }
    allowed = s.count < limit
    if (allowed) s.count++
    remaining = Math.max(0, limit-s.count); resetAt = start+window; retryMs = resetAt-now
  } else if (policy.algorithm === 'sliding_log') {
    s.events = (s.events ?? []).filter(t => t > now-window)
    allowed = s.events.length < limit
    if (allowed) s.events.push(now)
    remaining = Math.max(0,limit-s.events.length); resetAt = (s.events[0] ?? now)+window; retryMs = resetAt-now
  } else if (policy.algorithm === 'sliding_counter') {
    const start = Math.floor(now/window)*window
    if (s.start !== start) { s.previous=s.start===start-window ? s.current ?? 0 : 0; s.current=0; s.start=start }
    const weighted=(s.previous ?? 0)*(1-(now-start)/window)+(s.current ?? 0)
    allowed=weighted < limit
    if (allowed) s.current++
    remaining=Math.max(0,Math.floor(limit-weighted-(allowed?1:0))); resetAt=start+window; retryMs=resetAt-now
  } else if (policy.algorithm === 'token_bucket') {
    const capacity=policy.burst_capacity || limit, rate=policy.refill_rate || limit/window
    if (s.tokens === undefined) { s.tokens=capacity; s.at=now }
    s.tokens=Math.min(capacity,s.tokens+Math.max(0,now-s.at)*rate/1000); s.at=now
    allowed=s.tokens>=1
    if (allowed) s.tokens-=1
    remaining=Math.floor(s.tokens); retryMs=allowed?0:Math.ceil((1-s.tokens)/rate*1000); resetAt=now+retryMs
  } else {
    const capacity=policy.burst_capacity || limit, rate=policy.refill_rate || limit/window
    if (s.water === undefined) { s.water=0; s.at=now }
    s.water=Math.max(0,s.water-Math.max(0,now-s.at)*rate/1000); s.at=now
    allowed=s.water+1<=capacity
    if (allowed) s.water++
    remaining=Math.max(0,Math.floor(capacity-s.water)); retryMs=allowed?0:Math.ceil((s.water-capacity+1)/rate*1000); resetAt=now+retryMs
  }
  states.set(stateKey,s)
  return {id:randomUUID(),allowed,remaining,resetAt,retryAfterMs:Math.max(1,retryMs)}
}

export function clearStates(){states.clear()}
export function clearState(keyId,policyId){states.delete(`${keyId}:${policyId}`)}
