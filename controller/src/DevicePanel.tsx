import { colorHex, initial } from './profile.ts'
import { ProfileEditor } from './ProfileEditor.tsx'
import { useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { isSessionError } from './api.ts'
import type { EventItem } from './protection.ts'
import { BrowserEditor, LocationEditor, RestrictionsEditor, ScheduleEditor, SiteFilterEditor, TimeLimitsEditor, UsageReportEditor } from './Editors.tsx'
import type { Props } from './Editors.tsx'
import { agoText, deviceName, errorText, lastSeenText, statusText } from './format.ts'
import { summarizeProtection } from './protection.ts'
import type { ProtectionReport } from './protection.ts'
import { limitHitText, summarizeLimitHits } from './usageHistory.ts'
import type { LimitHit } from './usageHistory.ts'
import { minutesText, summarizeDailyUsage } from './dailyUsage.ts'
import type { DailyUsage } from './dailyUsage.ts'
import { SetupProgress } from './SetupProgress.tsx'
import { ReleasePanel } from './ReleasePanel.tsx'

/** Loads one kind of event for a panel; reloads when [reloads] changes. */
function useEvents<T>(
    { api, device, onSessionExpired }: Props,
    kind: string,
    summarize: (events: EventItem[]) => T,
    sinceMs?: number,
): { value: T | null; error: string; reload: () => void } {
    const [value, setValue] = useState<T | null>(null)
    const [error, setError] = useState('')
    const [reloads, setReloads] = useState(0)

    useEffect(() => {
        let current = true
        const since = sinceMs === undefined ? undefined : new Date(Date.now() - sinceMs)
        api
            .listEvents(device.deviceId, kind, since)
            .then((events) => {
                if (!current) return
                setValue(summarize(events))
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
    }, [api, device.deviceId, onSessionExpired, reloads, kind, summarize, sinceMs])

    return { value, error, reload: () => setReloads((count) => count + 1) }
}

function Panel({ title, onRefresh, error, children, footnote }: { title: string; onRefresh: () => void; error: string; children: ComponentChildren; footnote: string }) {
    return (
        <section class="card">
            <div class="card-head">
                <h3>{title}</h3>
                <button type="button" class="ghost small" onClick={onRefresh}>Refresh</button>
            </div>
            {error && <p role="alert" class="error">{error}</p>}
            {children}
            <p class="muted small">{footnote}</p>
        </section>
    )
}

function ProtectionStatus(props: Props) {
    const { value: reports, error, reload } = useEvents<ProtectionReport[]>(props, 'enforcement', summarizeProtection)
    return (
        <Panel
            title="Protection status"
            onRefresh={reload}
            error={error}
            footnote="What the phone has reported. A phone that is off or offline cannot report, so silence is not proof that everything is fine. Some problems are never marked restored."
        >
            {reports === null ? (
                !error && <p class="muted">Loading…</p>
            ) : reports.length === 0 ? (
                <p class="ok-line">No problems reported.</p>
            ) : (
                <ul class="list">
                    {reports.map((report) => (
                        <li key={report.key} class={report.state}>
                            <strong>{report.title}: {report.state === 'attention' ? 'needs attention' : 'restored'}</strong>
                            <span>{report.detail}</span>
                            <span class="muted small">Reported {lastSeenText(report.reportedAt)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    )
}

// The panel shows 7 days; ask for a little more so a phone in another time zone still has its 7th day.
const USAGE_WINDOW_MS = 9 * 24 * 60 * 60 * 1000

function DailyUsagePanel(props: Props) {
    const { value: days, error, reload } = useEvents<DailyUsage[]>(props, 'usage_report', summarizeDailyUsage, USAGE_WINDOW_MS)
    return (
        <Panel
            title="Daily app usage"
            onRefresh={reload}
            error={error}
            footnote="Minutes in the foreground per app, as the phone counted them when it last reported (about once an hour, busiest 30 apps per day)."
        >
            {days === null ? (
                !error && <p class="muted">Loading…</p>
            ) : days.length === 0 ? (
                <p class="muted">No usage report yet. Turn on the daily usage report under Sharing to receive one.</p>
            ) : (
                days.map((day) => {
                    const top = Math.max(1, ...day.apps.map((usage) => usage.minutes))
                    return (
                        <details key={day.date} class="day" open={day === days[0]}>
                            <summary>
                                <strong>{day.date}</strong>
                                <span>{minutesText(day.totalMinutes)} in total</span>
                            </summary>
                            <ul class="bars">
                                {day.apps.map((usage) => (
                                    <li key={usage.packageName}>
                                        <span class="bar-label">{usage.packageName}</span>
                                        <span class="bar" style={{ '--w': `${(usage.minutes / top) * 100}%` }} aria-hidden="true" />
                                        <span class="bar-value">{minutesText(usage.minutes)}</span>
                                    </li>
                                ))}
                            </ul>
                            <span class="muted small">Last updated {lastSeenText(day.reportedAt)}</span>
                        </details>
                    )
                })
            )}
        </Panel>
    )
}

function LimitHistory(props: Props) {
    const { value: hits, error, reload } = useEvents<LimitHit[]>(props, 'usage', summarizeLimitHits)
    return (
        <Panel
            title="Limit history"
            onRefresh={reload}
            error={error}
            footnote="The 20 most recent times the phone reported a daily limit being reached. It does not show how much time was used."
        >
            {hits === null ? (
                !error && <p class="muted">Loading…</p>
            ) : hits.length === 0 ? (
                <p class="muted">No daily limit has been reported as reached.</p>
            ) : (
                <ul class="list">
                    {hits.map((hit) => (
                        <li key={hit.id}>
                            <strong>{limitHitText(hit)}</strong>
                            <span class="muted small">Reported {lastSeenText(hit.occurredAt)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    )
}

function LockNow({ api, device, onSessionExpired }: Props) {
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    async function lock() {
        if (!window.confirm(`Lock "${deviceName(device, 'this phone')}" now?`)) return
        setBusy(true)
        setError('')
        setMessage('')
        try {
            const { woken } = await api.lockNow(device.deviceId)
            setMessage(woken
                ? 'Lock sent. The phone locks in a few seconds.'
                : 'Lock sent. This server cannot wake the phone, so it locks at its next check-in, within 15 minutes.')
        } catch (caught) {
            if (isSessionError(caught)) onSessionExpired()
            else setError(errorText(caught))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div class="lock">
            <button type="button" class="primary" onClick={lock} disabled={busy}>
                {busy ? 'Sending…' : 'Lock now'}
            </button>
            {message && <p role="status" class="muted small">{message}</p>}
            {error && <p role="alert" class="error">{error}</p>}
        </div>
    )
}

type Tab = 'activity' | 'rules' | 'sharing' | 'phone'

const TABS: { key: Tab; label: string }[] = [
    { key: 'activity', label: 'Activity' },
    { key: 'rules', label: 'Rules' },
    { key: 'sharing', label: 'Sharing' },
    { key: 'phone', label: 'Phone' },
]

export function DevicePanel(props: Props & { onRemoved: () => void; onChanged: () => void }) {
    const { device } = props
    const [tab, setTab] = useState<Tab>('activity')

    return (
        <div class="device">
            <header class="device-head">
                <div class="device-title">
                    <span class="avatar large" style={{ background: colorHex(device.color) }} aria-hidden="true">{initial(deviceName(device))}</span>
                    <div>
                        <h1>{deviceName(device)}</h1>
                        <p class="muted">
                            <span class={`pill ${device.status}`}>{statusText(device.status)}</span>
                            <span title={lastSeenText(device.lastSeen)}>Last seen {agoText(device.lastSeen)}</span>
                        </p>
                    </div>
                </div>
                <LockNow {...props} />
            </header>

            <SetupProgress {...props} />

            <div class="tabs" role="tablist" aria-label="Phone sections">
                {TABS.map(({ key, label }) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`tab-${key}`}
                        aria-selected={tab === key}
                        aria-controls="tab-panel"
                        class={tab === key ? 'tab active' : 'tab'}
                        onClick={() => setTab(key)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} class="stack">
                {tab === 'activity' && (
                    <>
                        <ProtectionStatus {...props} />
                        <DailyUsagePanel {...props} />
                        <LimitHistory {...props} />
                    </>
                )}
                {tab === 'rules' && (
                    <>
                        <TimeLimitsEditor {...props} />
                        <ScheduleEditor {...props} />
                        <SiteFilterEditor {...props} />
                        <BrowserEditor {...props} />
                        <RestrictionsEditor {...props} />
                    </>
                )}
                {tab === 'phone' && (
                    <>
                        <ProfileEditor {...props} />
                        <ReleasePanel {...props} />
                    </>
                )}
                {tab === 'sharing' && (
                    <>
                        <LocationEditor {...props} />
                        <UsageReportEditor {...props} />
                    </>
                )}
            </div>
        </div>
    )
}
