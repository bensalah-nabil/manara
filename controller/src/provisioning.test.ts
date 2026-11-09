import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MANARA_ADMIN, MANARA_SIGNATURE, TOKEN_KEY, provisioningQr, qrSetupAvailable } from './provisioning.ts'

const url = 'https://example.org/manara.apk'

test('the QR code carries what Android needs and the connection code, nothing more', () => {
    const qr = JSON.parse(provisioningQr('3f9a0c1d2e4b5a69', url))
    assert.deepEqual(Object.keys(qr).sort(), [
        'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE',
        'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME',
        'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION',
        'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM',
        'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED',
    ])
    assert.equal(qr['android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME'], MANARA_ADMIN)
    assert.equal(qr['android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM'], MANARA_SIGNATURE)
    assert.equal(qr['android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED'], true)
    assert.deepEqual(qr['android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE'], { [TOKEN_KEY]: '3f9a0c1d2e4b5a69' })
})

test('the signature is a URL-safe SHA-256 in base64, without padding', () => {
    assert.match(MANARA_SIGNATURE, /^[A-Za-z0-9_-]{43}$/)
})

test('QR setup is offered only with an HTTPS download', () => {
    assert.equal(qrSetupAvailable(null), false)
    assert.equal(qrSetupAvailable('http://example.org/manara.apk'), false)
    assert.equal(qrSetupAvailable(url), true)
    assert.throws(() => provisioningQr('t', 'http://example.org/manara.apk'))
})
