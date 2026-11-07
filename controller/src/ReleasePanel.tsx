import { useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { ReleaseCode, ReleaseMode } from './api.ts'
import type { Props } from './Editors.tsx'
import { errorText } from './format.ts'
import { minutesLeft, releaseCodeText } from './release.ts'

const CONFIRM: Record<ReleaseMode, string> = {
    transfer:
        'Move this phone to another parent account? For the next 30 minutes the phone accepts one connection code. ' +
        'This account stays in charge until the new one takes over.',
    remove:
        'Remove Manara from this phone? It lifts every rule, stops being managed, and disappears from this list. ' +
        'Setting it up again later means the full guided setup.',
}

const SENT: Record<ReleaseMode, string> = {
    transfer:
        'Sent. Within 30 minutes, add the phone from the other account and scan that code on the phone. ' +
        'The phone then leaves this list by itself.',
    remove: 'Sent. The phone lifts its rules and stops being managed as soon as it receives this, then leaves this list.',
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
            'Remove this phone from your list? Do this only once it has been released, or if it is lost. ' +
            'A phone that has not been released stays managed, and its release code cannot be shown again.',
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
                <h3>Move or remove this phone</h3>
                <p class="muted">
                    Only you can do this. Manara on the phone has no button for it, so your child cannot take the phone out of
                    your account.
                </p>
                <div class="actions start">
                    <button type="button" class="ghost" disabled={busy} onClick={() => release('transfer')}>Move to another account</button>
                    <button type="button" class="ghost danger" disabled={busy} onClick={() => release('remove')}>Remove Manara from this phone</button>
                </div>
                {message && <p role="status" class="banner ok">{message}</p>}
                {error && <p role="alert" class="error">{error}</p>}
            </section>

            <section class="card">
                <h3>Phone can't be reached?</h3>
                <p class="muted">
                    If the phone is offline, use a release code instead. On the phone, open Manara, tap "Release this phone" and
                    type the code. It works without a connection.
                </p>
                {code === null ? (
                    <button type="button" class="ghost" disabled={busy} onClick={showCode}>Show release code</button>
                ) : (
                    <div class="stack">
                        <code class="release-code" aria-label="Release code">{releaseCodeText(code.code)}</code>
                        <p class="muted small">
                            Changes in about {minutesLeft(code.validUntil)} min, and still works for 10 min after that.{' '}
                            <button type="button" class="link" onClick={showCode}>New code</button>
                        </p>
                        {!code.phoneReady && (
                            <p class="banner">
                                This phone hasn't received its release key yet. It gets it at its next check-in; until then a code
                                typed on the phone won't work.
                            </p>
                        )}
                    </div>
                )}
            </section>

            <section class="card">
                <h3>Remove from your list</h3>
                <p class="muted">For a phone that is lost, or that you released with a code while it was offline.</p>
                <button type="button" class="link danger" disabled={busy} onClick={removeFromList}>Remove from my list</button>
            </section>
        </>
    )
}
