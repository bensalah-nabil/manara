import { useEffect, useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { Props } from './Editors.tsx'
import { errorText } from './format.ts'
import { t } from './i18n.ts'
import { applyAtText, loosensSentence, onPendingChanged, pendingChanged, remainingText } from './pending.ts'
import type { PendingChange } from './pending.ts'

/**
 * What is waiting out this phone's cooling-off delay, on every tab of the phone's page, with a
 * way to cancel it. Read again after any save, and every minute so the time left stays right.
 */
export function PendingBanner({ api, device, onSessionExpired }: Props) {
    const [items, setItems] = useState<PendingChange[]>([])
    const [reads, setReads] = useState(0)
    const [now, setNow] = useState(() => Date.now())
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState('')
    const [error, setError] = useState('')

    useEffect(() => onPendingChanged(() => setReads((count) => count + 1)), [])
    useEffect(() => {
        const timer = window.setInterval(() => { setNow(Date.now()); setReads((count) => count + 1) }, 60_000)
        return () => window.clearInterval(timer)
    }, [])
    useEffect(() => {
        let current = true
        api.listPending(device.deviceId)
            .then((list) => { if (current) { setItems(list); setNow(Date.now()) } })
            .catch((caught) => { if (current && isSessionError(caught)) onSessionExpired() })
        return () => { current = false }
    }, [api, device.deviceId, onSessionExpired, reads])

    async function cancel(kind: PendingChange['kind']) {
        setBusy(true)
        setError('')
        try {
            await api.cancelPending(device.deviceId, kind)
            setNote(t('pending.cancelled'))
            pendingChanged()
        } catch (caught) {
            if (isSessionError(caught)) onSessionExpired()
            else setError(errorText(caught))
        } finally {
            setBusy(false)
        }
    }

    if (items.length === 0) {
        return note ? <p role="status" class="banner ok">{note}</p> : null
    }
    return (
        <section class="card stack pending" aria-live="polite">
            <h3>{t('pending.title')}</h3>
            {items.map((item) => (
                <div key={item.kind} class="pending-item">
                    <p>{t('pending.item', { what: loosensSentence(item.loosens), when: applyAtText(item.applyAt), left: remainingText(item.applyAt, now) })}</p>
                    <button type="button" class="primary" disabled={busy} onClick={() => void cancel(item.kind)}>{t('pending.cancel')}</button>
                </div>
            ))}
            {error && <p role="alert" class="error">{error}</p>}
        </section>
    )
}
