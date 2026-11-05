import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, createApi } from './api.ts'

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function recorder(respond: () => Response | Promise<Response>) {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return respond()
    }) as unknown as typeof fetch
    return { calls, fetchImpl }
}

test('login posts credentials without an Authorization header', async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(200, { parentId: 'p1', parentSession: 's1' }))
    const api = createApi({ baseUrl: 'http://x/api/v1/', getToken: () => 'stale', fetchImpl })
    assert.deepEqual(await api.login('a@b.c', 'secret123'), { parentId: 'p1', parentSession: 's1' })
    assert.equal(calls[0].url, 'http://x/api/v1/console/auth/login')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.body, JSON.stringify({ email: 'a@b.c', password: 'secret123' }))
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, undefined)
})

test('signup uses the signup endpoint', async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(200, { parentId: 'p', parentSession: 's' }))
    await createApi({ baseUrl: 'http://x', getToken: () => null, fetchImpl }).signUp('a@b.c', 'secret123')
    assert.equal(calls[0].url, 'http://x/console/auth/signup')
})

test('listDevices sends the bearer token, and never calls out without one', async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(200, []))
    let token: string | null = 'tok'
    const api = createApi({ baseUrl: 'http://x', getToken: () => token, fetchImpl })
    assert.deepEqual(await api.listDevices(), [])
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer tok')
    token = null
    await assert.rejects(api.listDevices(), (error: ApiError) => error.code === 'no_session' && error.status === 401)
    assert.equal(calls.length, 1)
})

test('createEnrollmentToken posts with the bearer token and returns the token', async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(200, { enrollmentToken: 'abc123' }))
    const api = createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl })
    assert.equal(await api.createEnrollmentToken(), 'abc123')
    assert.equal(calls[0].url, 'http://x/console/enrollment-tokens')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.body, undefined)
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer tok')
})

test('createEnrollmentToken rejects a missing session and malformed responses', async () => {
    const none = recorder(() => jsonResponse(200, { enrollmentToken: 'x' }))
    await assert.rejects(
        createApi({ baseUrl: 'http://x', getToken: () => null, fetchImpl: none.fetchImpl }).createEnrollmentToken(),
        (error: ApiError) => error.code === 'no_session',
    )
    assert.equal(none.calls.length, 0)

    for (const body of [{}, { enrollmentToken: '' }, { enrollmentToken: 5 }, null]) {
        const api = createApi({
            baseUrl: 'http://x',
            getToken: () => 't',
            fetchImpl: recorder(() => jsonResponse(200, body)).fetchImpl,
        })
        await assert.rejects(api.createEnrollmentToken(), (error: ApiError) => error.code === 'bad_response')
    }
})

test('getPolicy and setPolicy use the policy path, encode the id, and keep unknown fields', async () => {
    const policy = { version: 4, location: { enabled: true }, future: { x: 1 } }
    const { calls, fetchImpl } = recorder(() => jsonResponse(200, policy))
    const api = createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl })
    assert.deepEqual(await api.getPolicy('a/b'), policy)
    assert.equal(calls[0].url, 'http://x/console/devices/a%2Fb/policy')
    assert.equal(calls[0].init.method, 'GET')
    assert.deepEqual(await api.setPolicy('d1', policy), policy)
    assert.equal(calls[1].init.method, 'PUT')
    assert.equal(calls[1].init.body, JSON.stringify(policy))
    assert.equal((calls[1].init.headers as Record<string, string>).Authorization, 'Bearer tok')
})

test('policy responses without a numeric version are rejected, and a session is required', async () => {
    const bad = createApi({
        baseUrl: 'http://x',
        getToken: () => 't',
        fetchImpl: recorder(() => jsonResponse(200, { timeLimits: {} })).fetchImpl,
    })
    await assert.rejects(bad.getPolicy('d'), (error: ApiError) => error.code === 'bad_response')
    const none = recorder(() => jsonResponse(200, { version: 1 }))
    const anonymous = createApi({ baseUrl: 'http://x', getToken: () => null, fetchImpl: none.fetchImpl })
    await assert.rejects(anonymous.setPolicy('d', { version: 1 }), (error: ApiError) => error.code === 'no_session')
    assert.equal(none.calls.length, 0)
})

test('lockNow posts only a lock_now command for that device', async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(202, { commandId: 'c', type: 'lock_now', status: 'pending' }))
    await createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl }).lockNow('d1')
    assert.equal(calls[0].url, 'http://x/console/devices/d1/commands')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.body, JSON.stringify({ type: 'lock_now' }))
})

test('listEvents filters by kind, encodes both parts, and rejects non-arrays', async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(200, [{ id: 'e', kind: 'enforcement', occurredAt: 't' }]))
    const api = createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl })
    assert.equal((await api.listEvents('a/b', 'enforcement')).length, 1)
    assert.equal(calls[0].url, 'http://x/console/devices/a%2Fb/events?kind=enforcement')
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer tok')
    const bad = createApi({ baseUrl: 'http://x', getToken: () => 't', fetchImpl: recorder(() => jsonResponse(200, {})).fetchImpl })
    await assert.rejects(bad.listEvents('d', 'enforcement'), (error: ApiError) => error.code === 'bad_response')
})

test('error bodies map to codes; non-JSON error bodies keep only the status', async () => {
    const withCode = createApi({
        baseUrl: 'http://x',
        getToken: () => 't',
        fetchImpl: recorder(() => jsonResponse(401, { code: 'invalid_token', message: 'no' })).fetchImpl,
    })
    await assert.rejects(withCode.listDevices(), (error: ApiError) => error.code === 'invalid_token' && error.status === 401)

    const plain = createApi({
        baseUrl: 'http://x',
        getToken: () => 't',
        fetchImpl: recorder(() => new Response('oops', { status: 502 })).fetchImpl,
    })
    await assert.rejects(plain.listDevices(), (error: ApiError) => error.code === 'http_error' && error.status === 502)
})

test('network failures and malformed success bodies are distinct errors', async () => {
    const offline = createApi({
        baseUrl: 'http://x',
        getToken: () => 't',
        fetchImpl: (async () => {
            throw new TypeError('failed')
        }) as unknown as typeof fetch,
    })
    await assert.rejects(offline.login('a', 'b'), (error: ApiError) => error.code === 'network' && error.status === 0)

    const badAuth = createApi({
        baseUrl: 'http://x',
        getToken: () => null,
        fetchImpl: recorder(() => jsonResponse(200, { parentId: 'p' })).fetchImpl,
    })
    await assert.rejects(badAuth.login('a', 'b'), (error: ApiError) => error.code === 'bad_response')

    const badList = createApi({
        baseUrl: 'http://x',
        getToken: () => 't',
        fetchImpl: recorder(() => jsonResponse(200, { devices: [] })).fetchImpl,
    })
    await assert.rejects(badList.listDevices(), (error: ApiError) => error.code === 'bad_response')
})
