import { useEffect, useState } from 'react'
import { isSessionError } from './api.ts'
import { LocationEditor, RestrictionsEditor, ScheduleEditor, SiteFilterEditor, TimeLimitsEditor } from './Editors.tsx'
import type { Props } from './Editors.tsx'
import { errorText, lastSeenText } from './format.ts'
import { summarizeProtection } from './protection.ts'
import type { ProtectionReport } from './protection.ts'

function ProtectionStatus({ api, device, onSessionExpired }: Props) {
    const [reports, setReports] = useState<ProtectionReport[] | null>(null)
    const [error, setError] = useState('')
    const [reloads, setReloads] = useState(0)

    useEffect(() => {
        let current = true
        api
            .listEvents(device.deviceId, 'enforcement')
            .then((events) => {
                if (!current) return
                setReports(summarizeProtection(events))
                setError('')
            })
            .catch((caught: unknown) => {
                if (!current) return
                if (isSessionError(caught)) onSessionExpired()
                else setError(errorText(caught))
            })
        return () => {
            current = false
        }
    }, [api, device.deviceId, onSessionExpired, reloads])

    return (
        <div className="stack">
            <div className="row">
                <strong>Protection status</strong>
                <button type="button" className="link" onClick={() => setReloads((count) => count + 1)}>Refresh</button>
            </div>
            <p role="alert" className="error">{error}</p>
            {reports === null ? (
                !error && <p className="hint">Loading...</p>
            ) : reports.length === 0 ? (
                <p className="hint">No problems reported.</p>
            ) : (
                <ul className="reports">
                    {reports.map((report) => (
                        <li key={report.key} className={report.state}>
                            <strong>{report.title}: {report.state === 'attention' ? 'needs attention' : 'restored'}</strong>
                            <span>{report.detail}</span>
                            <span className="hint">Reported {lastSeenText(report.reportedAt)}</span>
                        </li>
                    ))}
                </ul>
            )}
            <p className="hint">
                This shows what the phone has reported. A phone that is switched off or offline cannot report,
                so silence is not proof that everything is fine. Some problems are never marked restored.
            </p>
        </div>
    )
}

function LockNow({ api, device, onSessionExpired }: Props) {
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    async function lock() {
        if (!window.confirm(`Lock "${device.label || 'this device'}" now?`)) return
        setBusy(true)
        setError('')
        setMessage('')
        try {
            await api.lockNow(device.deviceId)
            setMessage('Lock sent. The phone locks when it receives it: right away if it can be reached, otherwise at its next check-in.')
        } catch (caught) {
            if (isSessionError(caught)) onSessionExpired()
            else setError(errorText(caught))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="stack">
            <button type="button" onClick={lock} disabled={busy}>
                {busy ? 'Sending...' : 'Lock now'}
            </button>
            {message && <p role="status" className="hint">{message}</p>}
            <p role="alert" className="error">{error}</p>
        </div>
    )
}

export function DevicePanel(props: Props) {
    return (
        <div className="stack">
            <ProtectionStatus {...props} />
            <LockNow {...props} />
            <TimeLimitsEditor {...props} />
            <ScheduleEditor {...props} />
            <LocationEditor {...props} />
            <SiteFilterEditor {...props} />
            <RestrictionsEditor {...props} />
        </div>
    )
}
