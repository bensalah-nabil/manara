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

const ENROLL = {
    attestation: { parentOrGuardian: true, minorChild: true, childInformed: true },
    version: '2026-11-06',
    phoneBrand: 'samsung',
}

test('createEnrollmentToken posts the attestation with the bearer token and returns the token', async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(200, { enrollmentToken: 'abc123' }))
    const api = createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl })
    assert.equal(await api.createEnrollmentToken(ENROLL), 'abc123')
    assert.equal(calls[0].url, 'http://x/console/enrollment-tokens')
    assert.equal(calls[0].init.method, 'POST')
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
        attestation: { parentOrGuardian: true, minorChild: true, childInformed: true, version: '2026-11-06' },
        phoneBrand: 'samsung',
    })
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer tok')
})

test('createEnrollmentToken rejects a missing session and malformed responses', async () => {
    const none = recorder(() => jsonResponse(200, { enrollmentToken: 'x' }))
    await assert.rejects(
        createApi({ baseUrl: 'http://x', getToken: () => null, fetchImpl: none.fetchImpl }).createEnrollmentToken(ENROLL),
        (error: ApiError) => error.code === 'no_session',
    )
    assert.equal(none.calls.length, 0)

    for (const body of [{}, { enrollmentToken: '' }, { enrollmentToken: 5 }, null]) {
        const api = createApi({
            baseUrl: 'http://x',
            getToken: () => 't',
            fetchImpl: recorder(() => jsonResponse(200, body)).fetchImpl,
        })
        await assert.rejects(api.createEnrollmentToken(ENROLL), (error: ApiError) => error.code === 'bad_response')
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

test('release posts a release command with its mode', async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(202, { commandId: 'c', type: 'release', status: 'pending' }))
    const api = createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl })
    await api.release('d 1', 'transfer')
    assert.equal(calls[0].url, 'http://x/console/devices/d%201/commands')
    assert.equal(calls[0].init.body, JSON.stringify({ type: 'release', params: { mode: 'transfer' } }))
})

test('getReleaseCode returns the code and rejects malformed responses', async () => {
    const good = recorder(() => jsonResponse(200, { code: '12345678', validUntil: '2026-11-07T10:00:00Z', phoneReady: true }))
    const code = await createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl: good.fetchImpl }).getReleaseCode('d1')
    assert.deepEqual(code, { code: '12345678', validUntil: '2026-11-07T10:00:00Z', phoneReady: true })
    assert.equal(good.calls[0].url, 'http://x/console/devices/d1/release-code')
    const bad = recorder(() => jsonResponse(200, { code: 12345678 }))
    await assert.rejects(createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl: bad.fetchImpl }).getReleaseCode('d1'),
        (e: unknown) => e instanceof ApiError && e.code === 'bad_response')
})

test('deleteDevice deletes the device itself', async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(200, { deleted: true }))
    await createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl }).deleteDevice('d1')
    assert.equal(calls[0].url, 'http://x/console/devices/d1')
    assert.equal(calls[0].init.method, 'DELETE')
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

test('listEvents can limit to events since a time, sent as an encoded RFC 3339 instant', async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(200, []))
    const api = createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl })
    await api.listEvents('d', 'usage_report', new Date('2026-11-01T10:20:30.000Z'))
    assert.equal(calls[0].url, 'http://x/console/devices/d/events?kind=usage_report&since=2026-11-01T10%3A20%3A30.000Z')
})

test('getSetup returns null before any report and fills in missing account lists', async () => {
    const none = recorder(() => jsonResponse(200, null))
    const api = createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl: none.fetchImpl })
    assert.equal(await api.getSetup('a/b'), null)
    assert.equal(none.calls[0].url, 'http://x/console/devices/a%2Fb/setup')

    const partial = recorder(() => jsonResponse(200, { deviceId: 'd', step: 'linked', status: 'in_progress' }))
    const setup = await createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl: partial.fetchImpl }).getSetup('d')
    assert.deepEqual([setup?.message, setup?.initialAccounts, setup?.currentAccounts], ['', [], []])

    const bad = createApi({ baseUrl: 'http://x', getToken: () => 't', fetchImpl: recorder(() => jsonResponse(200, { step: 3 })).fetchImpl })
    await assert.rejects(bad.getSetup('d'), (error: ApiError) => error.code === 'bad_response')
})

test('clearSetupAccounts deletes the saved account lists for that device', async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(200, { cleared: true }))
    await createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl }).clearSetupAccounts('d1')
    assert.equal(calls[0].url, 'http://x/console/devices/d1/setup/accounts')
    assert.equal(calls[0].init.method, 'DELETE')
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

test('getSetup passes the pairing QR on only when it is a non-empty string', async () => {
    const withQr = recorder(() => jsonResponse(200, { deviceId: 'd', step: 'pairing', status: 'waiting_for_parent', pairingQr: 'WIFI:T:ADB;S:manara-ab12;P:pw;;', finishRequested: false }))
    const setup = await createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl: withQr.fetchImpl }).getSetup('d')
    assert.equal(setup?.pairingQr, 'WIFI:T:ADB;S:manara-ab12;P:pw;;')
    assert.equal(setup?.finishRequested, false)
    const odd = recorder(() => jsonResponse(200, { deviceId: 'd', step: 'pairing', status: 'waiting_for_parent', pairingQr: 7, finishRequested: 'yes' }))
    const other = await createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl: odd.fetchImpl }).getSetup('d')
    assert.equal(other?.pairingQr, undefined)
    assert.equal(other?.finishRequested, false)
})

test('sendPairingCode and finishSetup post to that device', async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(202, { sent: true }))
    const api = createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl })
    await api.sendPairingCode('d 1', '123456')
    assert.equal(calls[0].url, 'http://x/console/devices/d%201/setup/pairing-code')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.body, JSON.stringify({ code: '123456' }))
    await api.finishSetup('d1')
    assert.equal(calls[1].url, 'http://x/console/devices/d1/setup/finish')
    assert.equal(calls[1].init.method, 'POST')
})
