import { colorHex, initial } from './profile.ts'
import { ProfileEditor } from './ProfileEditor.tsx'
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { isSessionError } from './api.ts'
import type { EventItem } from './protection.ts'
import { AppChangesEditor, BrowserEditor, CallAlertsEditor, CallLogEditor, ChangeDelayEditor, LocationEditor, RestrictionsEditor, ScheduleEditor, SiteFilterEditor, TimeLimitsEditor, UsageReportEditor } from './Editors.tsx'
import { PendingBanner } from './PendingBanner.tsx'
import type { Props } from './Editors.tsx'
import { agoText, deviceName, errorText, lastSeenText, statusText } from './format.ts'
import { summarizeProtection } from './protection.ts'
import type { ProtectionReport } from './protection.ts'
import { limitHitText, summarizeLimitHits } from './usageHistory.ts'
import type { LimitHit } from './usageHistory.ts'
import { minutesText, summarizeDailyUsage } from './dailyUsage.ts'
import type { DailyUsage } from './dailyUsage.ts'
import { SetupProgress } from './SetupProgress.tsx'
import { PhoneReady } from './PhoneReady.tsx'
import { SetupHelp } from './SetupHelp.tsx'
import type { SetupReadiness } from './api.ts'
import type { DeviceSetup } from './setup.ts'
import { ReleasePanel } from './ReleasePanel.tsx'
import { InsightsPanel } from './InsightsPanel.tsx'
import { PrayerChart } from './PrayerChart.tsx'
import { RuleCards } from './RuleCards.tsx'
import { readCards } from './ruleCards.ts'
import { actionText, MAX_SHOWN as MAX_CHANGES, parseAppChanges, whenText } from './appChanges.ts'
import type { AppChangeItem } from './appChanges.ts'
import { alertsOn, isUnknownCaller, knownNumbers } from './callAlerts.ts'
import { directionText, durationText, groupByDay, MAX_SHOWN as MAX_CALLS, numberText, parseCalls, timeText } from './callLog.ts'
import { DayColumns } from './DayColumns.tsx'
import { appChangesPerDay, callsPerDay } from './dayCounts.ts'
import type { DayCount } from './dayCounts.ts'
import type { CallItem } from './callLog.ts'
import { appName } from './insights.ts'
import { joinList, t, tn } from './i18n.ts'

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

/** A long list starts short; the parent opens the rest. */
function useFirst<T>(items: T[] | null, first: number): { shown: T[]; more: ComponentChildren } {
    const [all, setAll] = useState(false)
    if (items === null) return { shown: [], more: null }
    const hidden = items.length - first
    if (hidden <= 0) return { shown: items, more: null }
    return {
        shown: all ? items : items.slice(0, first),
        more: (
            <button type="button" class="link" aria-expanded={all} onClick={() => setAll(!all)}>
                {all ? t('panel.showFewer') : t('panel.showMore', { n: hidden })}
            </button>
        ),
    }
}

function Panel({ title, onRefresh, error, children, footnote }: { title: string; onRefresh: () => void; error: string; children: ComponentChildren; footnote: string }) {
    return (
        <section class="card">
            <div class="card-head">
                <h3>{title}</h3>
                <button type="button" class="ghost small" onClick={onRefresh}>{t('common.refresh')}</button>
            </div>
            {error && <p role="alert" class="error">{error}</p>}
            {children}
            <p class="muted small">{footnote}</p>
        </section>
    )
}

function ProtectionStatus(props: Props & { notBefore: number }) {
    const { notBefore } = props
    const summarize = useCallback((events: EventItem[]) => summarizeProtection(events, notBefore), [notBefore])
    const { value: reports, error, reload } = useEvents<ProtectionReport[]>(props, 'enforcement', summarize)
    return (
        <Panel
            title={t('protection.title')}
            onRefresh={reload}
            error={error}
            footnote={t('protection.footnote')}
        >
            {reports === null ? (
                !error && <p class="muted">{t('common.loading')}</p>
            ) : reports.length === 0 ? (
                <p class="ok-line">{t('protection.none')}</p>
            ) : (
                <ul class="list">
                    {reports.map((report) => (
                        <li key={report.key} class={report.state}>
                            <strong>{t(report.state === 'attention' ? 'protection.attention' : 'protection.restored', { title: report.title })}</strong>
                            <span>{report.detail}</span>
                            <span class="muted small">{t('panel.reported', { when: lastSeenText(report.reportedAt) })}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    )
}

// The panel shows 7 days; ask for a little more so a phone in another time zone still has its 7th day.
const USAGE_WINDOW_MS = 9 * 24 * 60 * 60 * 1000

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/** Every change for the chart, the newest for the list. */
function appChangeData(events: EventItem[]): { all: AppChangeItem[]; list: AppChangeItem[] } {
    const all = parseAppChanges(events)
    return { all, list: all.slice(0, MAX_CHANGES) }
}

function appChangeDay(day: DayCount): string {
    if (day.main + day.context === 0) return tn('appChanges.installedCount', 0)
    return joinList([
        ...(day.main > 0 ? [tn('appChanges.installedCount', day.main)] : []),
        ...(day.context > 0 ? [tn('appChanges.removedCount', day.context)] : []),
    ])
}

/** Apps installed or removed, newest first (roadmap W1), with the 30 days per day above. */
function AppChangesPanel(props: Props) {
    const { value, error, reload } = useEvents(props, 'app_change', appChangeData, THIRTY_DAYS_MS)
    const changes = value?.list ?? null
    const { shown, more } = useFirst(changes, 8)
    const perDay = useMemo(() => (value ? appChangesPerDay(value.all) : []), [value])
    return (
        <Panel title={t('appChanges.title')} onRefresh={reload} error={error} footnote={t('appChanges.footnote')}>
            {changes === null ? (
                !error && <p class="muted">{t('common.loading')}</p>
            ) : changes.length === 0 ? (
                <p class="muted">{t('appChanges.none')}</p>
            ) : (
                <>
                    <div class="stack">
                        <strong>{t('appChanges.perDay')}</strong>
                        <DayColumns days={perDay} label={t('appChanges.perDay')} mainName={t('appChanges.installed')} contextName={t('appChanges.removed')} below describe={appChangeDay} />
                    </div>
                    <ul class="call-list app-changes">
                        {shown.map((item) => (
                            <li key={item.id}>
                                <b title={item.packageName}>{item.label}</b>
                                <span class="muted">{actionText(item)}</span>
                                <span class="call-time">{whenText(item.occurredAt)}</span>
                            </li>
                        ))}
                    </ul>
                    {more}
                </>
            )}
        </Panel>
    )
}

/** Every call for the chart, the newest for the list. */
function callData(events: EventItem[]): { all: CallItem[]; list: CallItem[] } {
    const all = parseCalls(events)
    return { all, list: all.slice(0, MAX_CALLS) }
}

function CallHistoryPanel(props: Props) {
    const { value, error, reload } = useEvents(props, 'call', callData)
    const calls = value?.list ?? null
    const { shown, more } = useFirst(calls, 8)
    // With call alerts on, a call from a number the parent doesn't know is marked (roadmap W2).
    const [known, setKnown] = useState<string[] | null>(null)
    useEffect(() => {
        let current = true
        props.api.getPolicy(props.device.deviceId)
            .then((policy) => { if (current) setKnown(alertsOn(policy) ? knownNumbers(policy) : null) })
            .catch(() => undefined)
        return () => { current = false }
    }, [props.api, props.device.deviceId])
    const perDay = useMemo(() => (value ? callsPerDay(value.all, known) : []), [value, known])
    const callDay = (day: DayCount) => known === null || day.main === 0
        ? tn('calls.count', day.main + day.context)
        : joinList([tn('calls.count', day.main + day.context), tn('calls.unknownCount', day.main)])
    return (
        <Panel title={t('calls.title')} onRefresh={reload} error={error} footnote={t('calls.footnote')}>
            {calls === null ? (
                !error && <p class="muted">{t('common.loading')}</p>
            ) : calls.length === 0 ? (
                <p class="muted">{t('calls.none')}</p>
            ) : (
                <>
                    <div class="stack">
                        <strong>{t('calls.perDay')}</strong>
                        <DayColumns
                            days={perDay}
                            label={t('calls.perDay')}
                            mainName={known === null ? t('calls.calls') : t('calls.fromUnknown')}
                            contextName={known === null ? undefined : t('calls.others')}
                            describe={callDay}
                        />
                    </div>
                    {groupByDay(shown).map((day) => (
                        <div key={day.key} class="call-day">
                            <h4>{day.label}</h4>
                            <ul class="call-list">
                                {day.calls.map((call) => (
                                    <li key={call.id} class={call.direction === 'missed' ? 'missed' : undefined}>
                                        <span class="call-time">{timeText(call.occurredAt)}</span>
                                        <b>{numberText(call)}</b>
                                        <span class="muted">{directionText(call.direction)}{durationText(call) && `${t('common.listSeparator')}${durationText(call)}`}{known !== null && isUnknownCaller(call, known) && <> <span class="tag warn">{t('callAlerts.unknownTag')}</span></>}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    {more}
                </>
            )}
        </Panel>
    )
}

/** One day's apps, busiest first: the top few, the rest on request. */
function UsageDay({ day, open }: { day: DailyUsage; open: boolean }) {
    const top = Math.max(1, ...day.apps.map((usage) => usage.minutes))
    const { shown, more } = useFirst(day.apps, 6)
    return (
        <details class="day" open={open}>
            <summary>
                <strong>{day.date}</strong>
                <span>{t('usage.inTotal', { time: minutesText(day.totalMinutes) })}</span>
            </summary>
            <ul class="bars">
                {shown.map((usage) => (
                    <li key={usage.packageName}>
                        <span class="bar-label" title={usage.packageName}>{appName(usage.packageName)}</span>
                        <span class="bar" style={{ '--w': `${(usage.minutes / top) * 100}%` }} aria-hidden="true" />
                        <span class="bar-value">{minutesText(usage.minutes)}</span>
                    </li>
                ))}
            </ul>
            <div class="day-foot">
                {more}
                <span class="muted small">{t('usage.lastUpdated', { when: lastSeenText(day.reportedAt) })}</span>
            </div>
        </details>
    )
}

function DailyUsagePanel(props: Props) {
    const { value: days, error, reload } = useEvents<DailyUsage[]>(props, 'usage_report', summarizeDailyUsage, USAGE_WINDOW_MS)
    return (
        <Panel
            title={t('usage.title')}
            onRefresh={reload}
            error={error}
            footnote={t('usage.footnote')}
        >
            {days === null ? (
                !error && <p class="muted">{t('common.loading')}</p>
            ) : days.length === 0 ? (
                <p class="muted">{t('usage.none')}</p>
            ) : (
                days.map((day) => <UsageDay key={day.date} day={day} open={day === days[0]} />)
            )}
        </Panel>
    )
}

function LimitHistory(props: Props) {
    const { value: hits, error, reload } = useEvents<LimitHit[]>(props, 'usage', summarizeLimitHits)
    const { shown, more } = useFirst(hits, 5)
    return (
        <Panel
            title={t('limits.title')}
            onRefresh={reload}
            error={error}
            footnote={t('limits.footnote')}
        >
            {hits === null ? (
                !error && <p class="muted">{t('common.loading')}</p>
            ) : hits.length === 0 ? (
                <p class="muted">{t('limits.none')}</p>
            ) : (
                <>
                    <ul class="list">
                        {shown.map((hit) => (
                            <li key={hit.id}>
                                <strong>{limitHitText(hit)}</strong>
                                <span class="muted small">{t('panel.reported', { when: lastSeenText(hit.occurredAt) })}</span>
                            </li>
                        ))}
                    </ul>
                    {more}
                </>
            )}
        </Panel>
    )
}

function LockNow({ api, device, onSessionExpired }: Props) {
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    async function lock() {
        if (!window.confirm(t('lock.confirm', { name: deviceName(device, t('device.thisPhone')) }))) return
        setBusy(true)
        setError('')
        setMessage('')
        try {
            const { woken } = await api.lockNow(device.deviceId)
            setMessage(woken
                ? t('lock.sentWoken')
                : t('lock.sentLater'))
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
                {busy ? t('lock.sending') : t('lock.button')}
            </button>
            {message && <p role="status" class="muted small">{message}</p>}
            {error && <p role="alert" class="error">{error}</p>}
        </div>
    )
}

/** What the phone sends the parent, each with whether it's on now (read again when a setting closes). */
function SeenTab(props: Props) {
    const { api, device, onSessionExpired } = props
    const [on, setOn] = useState<{ location: boolean; report: boolean; calls: boolean; apps: boolean; strangers: boolean } | null>(null)
    const [reads, setReads] = useState(0)
    useEffect(() => {
        let current = true
        api.getPolicy(device.deviceId)
            .then((policy) => {
                if (!current) return
                const state = readCards(policy)
                setOn({ location: state.on.location, report: state.on.report, calls: state.calls, apps: state.apps, strangers: alertsOn(policy) })
            })
            .catch((caught) => { if (isSessionError(caught)) onSessionExpired() })
        return () => { current = false }
    }, [api, device.deviceId, onSessionExpired, reads])
    const reread = () => setReads((count) => count + 1)
    return (
        <>
            <p class="muted">{t('seen.intro')}</p>
            <LocationEditor {...props} on={on?.location} onClosed={reread} />
            <UsageReportEditor {...props} on={on?.report} onClosed={reread} />
            <CallLogEditor {...props} on={on?.calls} onClosed={reread} />
            <CallAlertsEditor {...props} on={on?.strangers} onClosed={reread} />
            <AppChangesEditor {...props} on={on?.apps} onClosed={reread} />
        </>
    )
}

type Tab = 'activity' | 'rules' | 'seen' | 'phone'

const TABS: { key: Tab; label: string }[] = [
    { key: 'activity', label: t('tab.activity') },
    { key: 'rules', label: t('tab.rules') },
    { key: 'seen', label: t('tab.seen') },
    { key: 'phone', label: t('tab.phone') },
]

export function DevicePanel(props: Props & { onRemoved: () => void; onChanged: () => void }) {
    const { device } = props
    const [tab, setTab] = useState<Tab>('activity')
    // Reports from before guided setup finished came from a phone Manara didn't manage yet.
    const [setupDoneAt, setSetupDoneAt] = useState(0)
    // Undefined until the timeline has loaded once; null when the phone never reported a step.
    const [setup, setSetup] = useState<DeviceSetup | null | undefined>(undefined)
    const [readiness, setReadiness] = useState<SetupReadiness | null>(null)
    const onReadiness = useCallback((value: SetupReadiness | null) => setReadiness(value), [])
    const onSetup = useCallback((setup: DeviceSetup | null) => {
        setSetup(setup)
        setSetupDoneAt(setup?.status === 'done' ? Date.parse(setup.updatedAt) || 0 : 0)
    }, [])

    return (
        <div class="device">
            <header class="device-head">
                <div class="device-title">
                    <span class="avatar large" style={{ background: colorHex(device.color) }} aria-hidden="true">{initial(deviceName(device))}</span>
                    <div>
                        <h1>{deviceName(device)}</h1>
                        <p class="muted">
                            <span class={`pill ${device.status}`}>{statusText(device.status)}</span>
                            <span title={lastSeenText(device.lastSeen)}>{t('device.lastSeen', { when: agoText(device.lastSeen) })}</span>
                            {device.agentVersion && <span>Manara {device.agentVersion}</span>}
                        </p>
                    </div>
                </div>
                <LockNow {...props} />
            </header>

            {/* Before guided setup starts, the steps for this exact phone; then the live timeline. */}
            {(setup === null || setup?.step === 'linked') && <PhoneReady {...props} onReadiness={onReadiness} />}
            <SetupProgress {...props} onSetup={onSetup} watch={readiness !== null && setup === null} />
            {/* Until setup is finished: the assistant, told where this phone is. */}
            {setup !== undefined && setup?.status !== 'done' && (
                <SetupHelp api={props.api} onSessionExpired={props.onSessionExpired} step={setup?.step ?? 'before'} status={setup?.status ?? ''} maker={device.manufacturer ?? ''} />
            )}
            <PendingBanner {...props} />

            <div class="tabs" role="tablist" aria-label={t('tab.label')}>
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
                        <InsightsPanel {...props} />
                        <div class="activity-grid">
                            <div class="stack">
                                <ProtectionStatus {...props} notBefore={setupDoneAt} />
                                <CallHistoryPanel {...props} />
                                <AppChangesPanel {...props} />
                            </div>
                            <div class="stack">
                                <DailyUsagePanel {...props} />
                                <LimitHistory {...props} />
                            </div>
                        </div>
                        <PrayerChart api={props.api} device={device} />
                    </>
                )}
                {tab === 'rules' && (
                    <RuleCards
                        {...props}
                        more={{
                            websites: <><BrowserEditor {...props} /><SiteFilterEditor {...props} /></>,
                            time: <><TimeLimitsEditor {...props} /><ScheduleEditor {...props} /></>,
                            protect: <><ChangeDelayEditor {...props} /><RestrictionsEditor {...props} /></>,
                        }}
                    />
                )}
                {tab === 'phone' && (
                    <>
                        <ProfileEditor {...props} />
                        <ReleasePanel {...props} />
                    </>
                )}
                {tab === 'seen' && <SeenTab {...props} />}
            </div>
        </div>
    )
}
