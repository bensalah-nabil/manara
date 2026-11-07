import { useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { Api } from './api.ts'
import { errorText } from './format.ts'
import { QrCode } from './QrCode.tsx'
import { pairingCode } from './setup.ts'

type Way = 'qr' | 'code'

/**
 * Pairs the phone's wireless debugging from here, so the phone never leaves its Wireless
 * debugging screen: leaving it cancels pairing (ADR-0005).
 */
export function PairPhone({ api, deviceId, qr, onSessionExpired }: {
    api: Api
    deviceId: string
    qr: string
    onSessionExpired: () => void
}) {
    const [way, setWay] = useState<Way>('qr')
    const [code, setCode] = useState('')
    const [sending, setSending] = useState(false)
    const [sent, setSent] = useState(false)
    const [error, setError] = useState('')

    async function send(event: Event) {
        event.preventDefault()
        const digits = pairingCode(code)
        if (!digits) {
            setError('The pairing code is the 6 digits under "Wi-Fi pairing code" on the phone.')
            return
        }
        setSending(true)
        setError('')
        try {
            await api.sendPairingCode(deviceId, digits)
            setSent(true)
            setCode('')
        } catch (caught) {
            if (isSessionError(caught)) onSessionExpired()
            else setError(errorText(caught))
        } finally {
            setSending(false)
        }
    }

    return (
        <div class="stack">
            <strong>Pair the phone</strong>
            <p class="hint">
                On the phone: Settings, Developer options, Wireless debugging. Keep the phone on that screen until pairing
                is done; everything else happens here.
            </p>
            <div class="tabs" role="tablist" aria-label="How to pair">
                {(['qr', 'code'] as const).map((key) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={way === key}
                        class={way === key ? 'tab active' : 'tab'}
                        onClick={() => setWay(key)}
                    >
                        {key === 'qr' ? 'QR code' : 'Pairing code'}
                    </button>
                ))}
            </div>
            {way === 'qr' ? (
                <div class="stack">
                    <p>On the phone, tap <strong>Pair device with QR code</strong> and point its camera at this code.</p>
                    <QrCode value={qr} label="Wireless debugging pairing QR code" />
                    <p class="hint">The phone pairs by itself a few seconds after scanning.</p>
                </div>
            ) : (
                <form class="stack" onSubmit={send}>
                    <p>
                        On the phone, tap <strong>Pair device with pairing code</strong>. Type the 6 digits it shows under
                        "Wi-Fi pairing code".
                    </p>
                    <label>
                        Pairing code
                        <input
                            value={code}
                            onInput={(event) => { setCode(event.currentTarget.value); setSent(false) }}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={7}
                            placeholder="123456"
                        />
                    </label>
                    <button type="submit" class="primary" disabled={sending || !code.trim()}>
                        {sending ? 'Sending...' : 'Send to the phone'}
                    </button>
                    {sent && <p role="status" class="hint">Sent. The phone pairs in a few seconds; its progress shows above.</p>}
                </form>
            )}
            <p role="alert" class="error">{error}</p>
        </div>
    )
}
