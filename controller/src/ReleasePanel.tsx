import { useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { ReleaseCode, ReleaseMode } from './api.ts'
import type { Props } from './Editors.tsx'
import { errorText } from './format.ts'
import { minutesLeft, releaseCodeText } from './release.ts'
import { t } from './i18n.ts'

const CONFIRM: Record<ReleaseMode, string> = {
    transfer:
        t('release.confirmTransfer'),
    remove:
        t('release.confirmRemove'),
}

const SENT: Record<ReleaseMode, string> = {
    transfer:
        t('release.sentTransfer'),
    remove: t('release.sentRemove'),
}

export function ReleasePanel({ api, device, onSessionExpired, onRemoved }: Props & { onRemoved: () => void }) {
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [code, setCode] = useState<ReleaseCode | null>(null)

    function fail(caught: unknown) {
        if (isSessionError(caught)) onSessionExpired()
        else setError(errorText(caught))
    }

    async function release(mode: ReleaseMode) {
        if (!window.confirm(CONFIRM[mode])) return
        setBusy(true)
        setError('')
        setMessage('')
        try {
            await api.release(device.deviceId, mode)
            setMessage(SENT[mode])
        } catch (caught) {
            fail(caught)
        } finally {
            setBusy(false)
        }
    }

    async function showCode() {
        setBusy(true)
        setError('')
        try {
            setCode(await api.getReleaseCode(device.deviceId))
        } catch (caught) {
            fail(caught)
        } finally {
            setBusy(false)
        }
    }

    async function removeFromList() {
        if (!window.confirm(
            t('release.confirmForget'),
        )) return
        setBusy(true)
        try {
            await api.deleteDevice(device.deviceId)
            onRemoved()
        } catch (caught) {
            fail(caught)
            setBusy(false)
        }
    }

    return (
        <>
            <section class="card">
                <h3>{t('release.title')}</h3>
                <p class="muted">
                    {t('release.onlyYou')}
                </p>
                <div class="actions start">
                    <button type="button" class="ghost" disabled={busy} onClick={() => release('transfer')}>{t('release.move')}</button>
                    <button type="button" class="ghost danger" disabled={busy} onClick={() => release('remove')}>{t('release.remove')}</button>
                </div>
                {message && <p role="status" class="banner ok">{message}</p>}
                {error && <p role="alert" class="error">{error}</p>}
            </section>

            <section class="card">
                <h3>{t('release.unreachableTitle')}</h3>
                <p class="muted">
                    {t('release.unreachableHelp')}
                </p>
                {code === null ? (
                    <button type="button" class="ghost" disabled={busy} onClick={showCode}>{t('release.showCode')}</button>
                ) : (
                    <div class="stack">
                        <code class="release-code" aria-label={t('release.codeLabel')}>{releaseCodeText(code.code)}</code>
                        <p class="muted small">
                            {t('release.codeChanges', { n: minutesLeft(code.validUntil) })}{' '}
                            <button type="button" class="link" onClick={showCode}>{t('release.newCode')}</button>
                        </p>
                        {!code.phoneReady && (
                            <p class="banner">
                                {t('release.notReady')}
                            </p>
                        )}
                    </div>
                )}
            </section>

            <section class="card">
                <h3>{t('release.forgetTitle')}</h3>
                <p class="muted">{t('release.forgetHelp')}</p>
                <button type="button" class="link danger" disabled={busy} onClick={removeFromList}>{t('release.forget')}</button>
            </section>
        </>
    )
}
