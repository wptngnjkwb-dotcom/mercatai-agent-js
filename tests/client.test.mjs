import assert from 'node:assert/strict'
import test from 'node:test'

import { MercataiClient, RedirectError } from '../dist/index.mjs'

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function mockFetch(responses) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const next = responses.shift()
    if (!next) throw new Error('Unexpected fetch')
    return next
  }
  return calls
}

function client(options = {}) {
  return new MercataiClient({ agentId: 'requester-agent', apiKey: 'secret', ...options })
}

test('uses www by default and never follows a login redirect', async () => {
  const calls = mockFetch([
    new Response('', { status: 307, headers: { location: 'https://www.mercatai.eu/api/v1/auth/login?token=SECRET' } }),
  ])
  await assert.rejects(client().listTasks(), error => {
    assert.ok(error instanceof RedirectError)
    assert.equal(error.location, 'https://www.mercatai.eu/api/v1/auth/login')
    assert.ok(!error.message.includes('SECRET'))
    return true
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://www.mercatai.eu/api/v1/auth/login')
  assert.equal(calls[0].init.redirect, 'manual')
})

test('creates a retry-safe Marketplace task without a buyer identity', async () => {
  const calls = mockFetch([
    jsonResponse({ access_token: 'access' }),
    jsonResponse({ id: 'task-1', human_approval_required: true }, 201),
  ])
  const result = await client().createTask({
    title: 'Validate an API',
    description: 'Run the documented checks and return a report.',
    category: 'code_review',
    budgetMaxEur: 30,
    deadlineHours: 24,
    idempotencyKey: 'js-task-request-0001',
  })
  assert.equal(result.id, 'task-1')
  const call = calls[1]
  assert.equal(call.init.headers['Idempotency-Key'], 'js-task-request-0001')
  const body = JSON.parse(call.init.body)
  assert.equal(body.budget_max_eur, 30)
  assert.ok(!('buyer_email' in body))
})

test('rejects an unsafe idempotency key before any network request', async () => {
  const calls = mockFetch([])
  await assert.rejects(client().createTask({
    title: 'Task', description: 'Detailed description', budgetMaxEur: 3,
    deadlineHours: 24, idempotencyKey: 'short',
  }), /idempotencyKey/)
  assert.equal(calls.length, 0)
})

test('sends delivery_note and refuses unsupported attachments', async () => {
  const calls = mockFetch([
    jsonResponse({ access_token: 'access' }),
    jsonResponse({ id: 'task-1', status: 'review' }),
  ])
  await client().deliver({ taskId: 'task/1', deliveryNote: 'Done' })
  assert.ok(calls[1].url.endsWith('/tasks/task%2F1/deliver'))
  assert.deepEqual(JSON.parse(calls[1].init.body), { delivery_note: 'Done' })

  const noCalls = mockFetch([])
  await assert.rejects(client().deliver({
    taskId: 'task-1', deliveryNote: 'Done', attachments: [{ filename: 'a', contentBase64: 'eA==' }],
  }), /not accepted/)
  assert.equal(noCalls.length, 0)
})

test('submits a bid using the canonical API fields and token identity', async () => {
  const calls = mockFetch([
    jsonResponse({ access_token: 'access' }),
    jsonResponse({ id: 'bid-1' }, 201),
  ])
  await client().bid({ taskId: 'task-1', priceEur: 9, estimatedHours: 2, proposal: 'I can do it.' })
  const body = JSON.parse(calls[1].init.body)
  assert.equal(body.delivery_hours, 2)
  assert.ok(!('estimated_hours' in body))
  assert.ok(!('agent_id' in body))
})

test('creates a private agent-to-agent offer with complete terms', async () => {
  const calls = mockFetch([
    jsonResponse({ access_token: 'access' }),
    jsonResponse({ direct_offer_id: 'offer-1', status: 'pending_agent' }, 201),
  ])
  const result = await client().createDirectOffer({
    providerAgentId: 'provider/agent',
    title: 'Analyze data',
    scope: 'Analyze the supplied data and explain anomalies.',
    category: 'data_analysis',
    priceEur: 25,
    deliveryHours: 12,
    deliverables: ['Report'],
    requiredInputs: ['CSV'],
    outputFormats: ['markdown'],
    idempotencyKey: 'js-direct-offer-0001',
  })
  assert.equal(result.direct_offer_id, 'offer-1')
  assert.ok(calls[1].url.endsWith('/agents/provider%2Fagent/direct-offers'))
  assert.equal(calls[1].init.headers['Idempotency-Key'], 'js-direct-offer-0001')
  const body = JSON.parse(calls[1].init.body)
  assert.deepEqual(body.required_inputs, ['CSV'])
  assert.ok(!('buyer_email' in body))
})

test('requires explicit confirmation before autonomous payment execution', async () => {
  const calls = mockFetch([])
  await assert.rejects(client().executePayment('proposal-1'), /real charge/)
  assert.equal(calls.length, 0)

  const confirmedCalls = mockFetch([
    jsonResponse({ access_token: 'access' }),
    jsonResponse({ status: 'funded', execution_authorized: true }),
  ])
  const result = await client().executePayment('proposal/1', true)
  assert.equal(result.status, 'funded')
  assert.ok(confirmedCalls[1].url.endsWith('/payment-proposals/proposal%2F1/execute'))
})
