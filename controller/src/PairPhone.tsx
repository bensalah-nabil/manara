import { useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { Api } from './api.ts'
import { errorText } from './format.ts'
import { QrCode } from './QrCode.tsx'
import { Rich } from './Rich.tsx'
import { pairingCode } from './setup.ts'
import { t } from './i18n.ts'

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
            setError(t('pair.badCode'))
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
            <strong>{t('pair.title')}</strong>
            <p class="hint">
                {t('pair.hint')}
            </p>
            <div class="tabs" role="tablist" aria-label={t('pair.howLabel')}>
                {(['qr', 'code'] as const).map((key) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={way === key}
                        class={way === key ? 'tab active' : 'tab'}
                        onClick={() => setWay(key)}
                    >
                        {key === 'qr' ? t('pair.tabQr') : t('pair.tabCode')}
                    </button>
                ))}
            </div>
            {way === 'qr' ? (
                <div class="stack">
                    <p><Rich text={t('pair.qrHelp')} /></p>
                    <QrCode value={qr} label={t('pair.qrLabel')} />
                    <p class="hint">{t('pair.qrAuto')}</p>
                </div>
            ) : (
                <form class="stack" onSubmit={send}>
                    <p>
                        <Rich text={t('pair.codeHelp')} />
                    </p>
                    <label>
                        {t('pair.tabCode')}
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
                        {sending ? t('pair.sending') : t('pair.send')}
                    </button>
                    {sent && <p role="status" class="hint">{t('pair.sent')}</p>}
                </form>
            )}
            <p role="alert" class="error">{error}</p>
        </div>
    )
}
