import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { isSessionError } from './api.ts'
import type { Props } from './Editors.tsx'
import { minutesText } from './dailyUsage.ts'
import { errorText } from './format.ts'
import {
    aboveUsual, applySuggestion, dailySeries, findInsights, hourGrid, lateNights, median, parseReports, suggestionText,
} from './insights.ts'
import type { Day, Insight, Report } from './insights.ts'
import type { Policy } from './policy.ts'
import type { EventItem } from './protection.ts'
import { savedText } from './usePolicyEditor.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Rows Monday first, as a week reads. */
const ROW_ORDER = [1, 2, 3, 4, 5, 6, 0]

function localDate(ms: number): string {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shortDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <div class="tile">
            <span class="tile-label">{label}</span>
            <span class="tile-value">{value}</span>
            {note && <span class="tile-note">{note}</span>}
        </div>
    )
}

/** Daily screen time: one column per day, days well above the child's usual emphasized. */
function DailyChart({ days, usual, compared }: { days: Day[]; usual: number | null; compared: number }) {
    const [hover, setHover] = useState<number | null>(null)
    const box = useRef<HTMLDivElement>(null)
    // On a narrow screen the chart scrolls: open it on the latest days, not the oldest.
    useEffect(() => { const el = box.current; el?.scrollTo({ left: el.scrollWidth }) }, [days])
    const W = 720, H = 190, left = 44, right = 8, top = 12, bottom = 26
    const plotW = W - left - right, plotH = H - top - bottom
    const max = Math.max(60, ...days.map((d) => d.minutes ?? 0), usual ?? 0)
    const topTick = Math.ceil(max / 60) * 60
    const y = (m: number) => top + plotH - (m / topTick) * plotH
    const slot = plotW / days.length
    const barW = Math.max(2, slot - 2) // 2px surface gap between bars

    const bar = (x: number, m: number) => {
        const h = Math.max(1, plotH - (y(m) - top))
        const r = Math.min(4, barW / 2, h)
        const yTop = top + plotH - h
        // Rounded data end, square on the baseline.
        return `M${x},${top + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${top + plotH} Z`
    }
    const hovered = hover === null ? null : days[hover]

    return (
        <div class="chart scroll" ref={box}>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Screen time per day, last 30 days">
                {[0, topTick / 2, topTick].map((m) => (
                    <g key={m}>
                        <line x1={left} x2={W - right} y1={y(m)} y2={y(m)} class="grid" />
                        <text x={left - 6} y={y(m) + 4} class="axis" text-anchor="end">{m === 0 ? '0' : `${m / 60} h`}</text>
                    </g>
                ))}
                {days.map((d, i) => {
                    const x = left + i * slot + 1
                    if (d.minutes === null) {
                        return <circle key={d.date} cx={x + barW / 2} cy={top + plotH - 3} r={1.5} class="missing" />
                    }
                    const high = aboveUsual(d.minutes, usual, compared)
                    return (
                        <path
                            key={d.date}
                            d={bar(x, d.minutes)}
                            class={`bar ${high ? 'high' : ''} ${hover === i ? 'hovered' : ''}`}
                            tabIndex={0}
                            aria-label={`${shortDate(d.date)}: ${minutesText(d.minutes)}${high ? ', well above usual' : ''}`}
                            onPointerEnter={() => setHover(i)}
                            onPointerLeave={() => setHover(null)}
                            onFocus={() => setHover(i)}
                            onBlur={() => setHover(null)}
                        />
                    )
                })}
                {usual !== null && (
                    <g>
                        <line x1={left} x2={W - right} y1={y(usual)} y2={y(usual)} class="usual" />
                        <text x={left + 4} y={y(usual) - 5} class="axis halo">usual {minutesText(usual)}</text>
                    </g>
                )}
                {days.map((d, i) => (i % 7 === days.length % 7 || i === days.length - 1) && (
                    <text key={d.date} x={left + i * slot + slot / 2} y={H - 8} class="axis" text-anchor="middle">
                        {i === days.length - 1 ? 'Today' : new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </text>
                ))}
            </svg>
            {hovered && hover !== null && (
                <div class="chart-tip" style={{ left: `${((left + hover * slot + slot / 2) / W) * 100}%` }}>
                    <strong>{shortDate(hovered.date)}</strong>
                    <span>{hovered.minutes === null ? 'No report' : minutesText(hovered.minutes)}</span>
                    {usual !== null && hovered.minutes !== null && <span class="muted">usual {minutesText(usual)}</span>}
                </div>
            )}
        </div>
    )
}

/** When the phone is used: weekday by hour, one hue, darker is more. */
function HourHeatmap({ grid, days }: { grid: number[][]; days: number[] }) {
    const [hover, setHover] = useState<{ weekday: number; hour: number } | null>(null)
    const cell = 26, gap = 2, left = 36, top = 6
    const W = left + 24 * cell, H = top + 7 * cell + 20
    const steps = [2, 5, 10, 20] // minutes in an hour, on average
    const level = (m: number) => (m <= 0.5 ? 0 : 1 + steps.filter((s) => m > s).length) // 0..5
    const night = (h: number) => h >= 22 || h < 6

    return (
        <div class="chart scroll">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Average minutes used per hour, by day of the week">
                {/* The night hours, outlined: 22:00 to 24:00 and 00:00 to 06:00. */}
                <rect x={left - 1} y={top - 1} width={6 * cell + 1} height={7 * cell + 1} class="night" />
                <rect x={left + 22 * cell - 1} y={top - 1} width={2 * cell + 1} height={7 * cell + 1} class="night" />
                {ROW_ORDER.map((weekday, row) => (
                    <g key={weekday}>
                        <text x={left - 6} y={top + row * cell + cell / 2 + 4} class="axis" text-anchor="end">{WEEKDAYS[weekday]}</text>
                        {grid[weekday].map((m, hour) => (
                            <rect
                                key={hour}
                                x={left + hour * cell + gap / 2}
                                y={top + row * cell + gap / 2}
                                width={cell - gap}
                                height={cell - gap}
                                rx={3}
                                class={`cell l${level(m)} ${hover?.weekday === weekday && hover.hour === hour ? 'hovered' : ''}`}
                                tabIndex={days[weekday] ? 0 : -1}
                                aria-label={`${WEEKDAYS[weekday]} ${hour}:00: about ${Math.round(m)} min`}
                                onPointerEnter={() => setHover({ weekday, hour })}
                                onPointerLeave={() => setHover(null)}
                                onFocus={() => setHover({ weekday, hour })}
                                onBlur={() => setHover(null)}
                            />
                        ))}
                    </g>
                ))}
                {[0, 6, 12, 18].map((h) => (
                    <text key={h} x={left + h * cell} y={H - 4} class="axis">{String(h).padStart(2, '0')}:00</text>
                ))}
            </svg>
            <div class="heat-legend" aria-hidden="true">
                <span>Less</span>
                {[0, 1, 2, 3, 4, 5].map((l) => <span key={l} class={`swatch-cell l${l}`} />)}
                <span>More</span>
                <span class="night-key">Night hours outlined</span>
            </div>
            {hover && (
                <p class="chart-readout" role="status">
                    {WEEKDAYS[hover.weekday]} {String(hover.hour).padStart(2, '0')}:00–{String((hover.hour + 1) % 24).padStart(2, '0')}:00:
                    about {Math.round(grid[hover.weekday][hover.hour])} min on average
                    {night(hover.hour) ? ' (night)' : ''}
                </p>
            )}
        </div>
    )
}

/**
 * The phone's own reports turned into what a parent can act on: how screen time moves, when the
 * phone is used, and what stands out, each with a rule it could add.
 */
export function InsightsPanel({ api, device, onSessionExpired }: Props) {
    const [reports, setReports] = useState<Report[] | null>(null)
    const [hits, setHits] = useState<EventItem[]>([])
    const [policy, setPolicy] = useState<Policy | null>(null)
    const [error, setError] = useState('')
    const [reloads, setReloads] = useState(0)
    const [busy, setBusy] = useState('')
    const [done, setDone] = useState<Record<string, string>>({})

    useEffect(() => {
        let current = true
        const now = Date.now()
        Promise.all([
            api.listEvents(device.deviceId, 'usage_report', new Date(now - 31 * DAY_MS)),
            api.listEvents(device.deviceId, 'usage', new Date(now - 8 * DAY_MS)),
            api.getPolicy(device.deviceId),
        ])
            .then(([usage, limitHits, currentPolicy]) => {
                if (!current) return
                setReports(parseReports(usage))
                setHits(limitHits)
                setPolicy(currentPolicy)
                setError('')
            })
            .catch((caught: unknown) => {
                if (!current) return
                if (isSessionError(caught)) onSessionExpired()
                else setError(errorText(caught))
            })
        return () => { current = false }
    }, [api, device.deviceId, onSessionExpired, reloads])

    const view = useMemo(() => {
        if (reports === null) return null
        const now = Date.now()
        const today = localDate(now)
        const days = dailySeries(reports, today, 30)
        const before = days.slice(0, -1).map((d) => d.minutes).filter((m): m is number => m !== null)
        const usual = median(before)
        const week = days.slice(-7).map((d) => d.minutes).filter((m): m is number => m !== null)
        const limitHits = hits.flatMap((e) => typeof e.payload?.category === 'string' ? [{ category: e.payload.category as string, occurredAt: e.occurredAt }] : [])
        return {
            days, usual, compared: before.length,
            todayMinutes: days[days.length - 1].minutes,
            weekAverage: week.length ? week.reduce((a, b) => a + b, 0) / week.length : null,
            nights: lateNights(reports, now).count,
            hitsThisWeek: limitHits.filter((h) => Date.parse(h.occurredAt) >= now - 7 * DAY_MS).length,
            grid: hourGrid(reports),
            insights: findInsights({ reports, limitHits, policy, today, now }),
        }
    }, [reports, hits, policy])

    async function addRule(insight: Insight) {
        if (!insight.suggestion || !window.confirm(suggestionText(insight.suggestion) + ' The child sees every rule on the phone.')) return
        setBusy(insight.id)
        try {
            const latest = await api.getPolicy(device.deviceId)
            const { policy: stored, woken } = await api.setPolicy(device.deviceId, applySuggestion(latest, insight.suggestion))
            setPolicy(stored)
            setDone((d) => ({ ...d, [insight.id]: savedText(stored.version, woken) }))
        } catch (caught) {
            if (isSessionError(caught)) onSessionExpired()
            else setError(errorText(caught))
        } finally {
            setBusy('')
        }
    }

    const reportsOn = (policy?.usageReport as { enabled?: boolean } | undefined)?.enabled === true

    return (
        <section class="card insights">
            <div class="card-head">
                <h3>Insights</h3>
                <button type="button" class="ghost small" onClick={() => setReloads((n) => n + 1)}>Refresh</button>
            </div>
            {error && <p role="alert" class="error">{error}</p>}
            {view === null ? (
                !error && <p class="muted">Loading…</p>
            ) : (
                <>
                    <div class="tiles">
                        <Tile
                            label="Today"
                            value={view.todayMinutes === null ? '—' : minutesText(view.todayMinutes)}
                            note={view.usual !== null && view.todayMinutes !== null
                                ? `${view.todayMinutes >= view.usual ? '+' : '−'}${minutesText(Math.abs(view.todayMinutes - view.usual))} vs usual`
                                : undefined}
                        />
                        <Tile label="Average, last 7 days" value={view.weekAverage === null ? '—' : minutesText(view.weekAverage)} />
                        <Tile label="Late nights, last 7" value={String(view.nights)} note="22:00 to 06:00" />
                        <Tile label="Limits reached, last 7 days" value={String(view.hitsThisWeek)} />
                    </div>

                    {view.insights.length > 0 && (
                        <div class="stack">
                            <strong>Worth a look</strong>
                            <ul class="insight-list">
                                {view.insights.map((insight) => (
                                    <li key={insight.id} class={`insight ${insight.tone}`}>
                                        <div>
                                            <strong>{insight.title}</strong>
                                            <p>{insight.detail}</p>
                                            {done[insight.id] && <p role="status" class="banner ok">{done[insight.id]}</p>}
                                        </div>
                                        {insight.suggestion && !done[insight.id] && (
                                            <button type="button" class="ghost small" disabled={busy === insight.id} onClick={() => addRule(insight)}>
                                                {busy === insight.id ? 'Adding…' : insight.suggestion.kind === 'limit' ? `Add a ${minutesText(insight.suggestion.minutes)} limit` : 'Add a night lock'}
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {reports && reports.length > 0 ? (
                        <>
                            <div class="stack">
                                <strong>Screen time per day</strong>
                                <DailyChart days={view.days} usual={view.usual} compared={view.compared} />
                                <p class="muted small">
                                    Highlighted days are well above this phone's usual day (at least half again, and 30 minutes
                                    more). A dot means the phone sent no report that day.
                                </p>
                                <details>
                                    <summary>Show as a table</summary>
                                    <div class="table-wrap">
                                        <table class="data-table">
                                            <thead><tr><th>Day</th><th>Screen time</th></tr></thead>
                                            <tbody>
                                                {[...view.days].reverse().map((d) => (
                                                    <tr key={d.date}><td>{shortDate(d.date)}</td><td>{d.minutes === null ? 'No report' : minutesText(d.minutes)}</td></tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </details>
                            </div>
                            <div class="stack">
                                <strong>When the phone is used</strong>
                                <HourHeatmap grid={view.grid.minutes} days={view.grid.days} />
                                <p class="muted small">
                                    Average minutes in each hour, from the phone's hourly reports, so it is approximate. In your
                                    time zone.
                                </p>
                            </div>
                        </>
                    ) : (
                        <p class="muted">
                            {reportsOn
                                ? 'No usage reports yet. The first ones arrive within an hour.'
                                : 'Turn on the daily usage report under Sharing to see screen time, when the phone is used, and what stands out.'}
                        </p>
                    )}
                    <p class="muted small">Built only from what the phone already reports. Your child sees the same data on the phone.</p>
                </>
            )}
        </section>
    )
}
