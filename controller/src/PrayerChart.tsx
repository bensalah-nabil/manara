import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Api, DeviceSummary } from './api.ts'
import { dateLocale, t } from './i18n.ts'
import type { MessageKey } from './i18n.ts'
import { CITIES, PRAYERS, clock, lastPlace, prayerSeries } from './prayerTimes.ts'
import type { Place, Prayer, PrayerDay } from './prayerTimes.ts'

const PERIODS = [
    { days: 7, key: 'prayers.period.week' },
    { days: 30, key: 'prayers.period.month' },
    { days: 91, key: 'prayers.period.quarter' },
    { days: 365, key: 'prayers.period.year' },
] as const satisfies readonly { days: number; key: MessageKey }[]

const NAME: Record<Prayer, MessageKey> = {
    fajr: 'prayers.fajr', dhuhr: 'prayers.dhuhr', asr: 'prayers.asr', maghrib: 'prayers.maghrib', isha: 'prayers.isha',
}

const DAY_MS = 24 * 60 * 60 * 1000
const PHONE = 'phone'

function dayLabel(date: string, options: Intl.DateTimeFormatOptions): string {
    return new Date(date + 'T12:00:00').toLocaleDateString(dateLocale(), options)
}

/** Which days get an x-axis label: every day for a week, then weeks, then month starts. */
function xTicks(days: PrayerDay[]): { index: number; label: string }[] {
    if (days.length <= 7) return days.map((d, index) => ({ index, label: dayLabel(d.date, { weekday: 'short', day: 'numeric' }) }))
    if (days.length <= 31) {
        return days.flatMap((d, index) => (index % 7 === 0 ? [{ index, label: dayLabel(d.date, { day: 'numeric', month: 'short' }) }] : []))
    }
    return days.flatMap((d, index) => (d.date.endsWith('-01') ? [{ index, label: dayLabel(d.date, { month: 'short' }) }] : []))
}

/**
 * The five prayer times over a week to a year, at the phone's last known position, so a parent sees
 * how the day's rhythm shifts with the seasons. Days run along the x axis, the time of day up the y
 * axis, one line per prayer.
 */
function Chart({ days }: { days: PrayerDay[] }) {
    const [hover, setHover] = useState<number | null>(null)
    const svg = useRef<SVGSVGElement>(null)
    const W = 720, H = 280, left = 48, right = 72, top = 12, bottom = 28
    const plotW = W - left - right, plotH = H - top - bottom

    const all = days.flatMap((d) => PRAYERS.map((p) => d.times[p]).filter((m): m is number => m !== undefined))
    const low = Math.floor((Math.min(...all) - 30) / 120) * 120
    const high = Math.ceil((Math.max(...all) + 30) / 120) * 120
    const x = (i: number) => left + (days.length === 1 ? plotW / 2 : (i / (days.length - 1)) * plotW)
    // Later in the day is higher up.
    const y = (m: number) => top + plotH - ((m - low) / (high - low)) * plotH
    const ticks: number[] = []
    for (let m = low; m <= high; m += 120) ticks.push(m)

    const path = (prayer: Prayer) => {
        let d = ''
        days.forEach((day, i) => {
            const m = day.times[prayer]
            if (m === undefined) return
            d += `${d === '' ? 'M' : 'L'}${x(i).toFixed(1)},${y(m).toFixed(1)}`
        })
        return d
    }

    function pick(clientX: number) {
        const box = svg.current?.getBoundingClientRect()
        if (!box || box.width === 0) return
        const px = ((clientX - box.left) / box.width) * W
        const i = Math.round(((px - left) / plotW) * (days.length - 1))
        setHover(Math.max(0, Math.min(days.length - 1, i)))
    }

    function keys(event: KeyboardEvent) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
        event.preventDefault()
        const now = hover ?? 0
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? days.length - 1 : now + (event.key === 'ArrowRight' ? 1 : -1)
        setHover(Math.max(0, Math.min(days.length - 1, next)))
    }

    const last = days.length - 1
    const shown = hover === null ? null : days[hover]

    return (
        <div class="chart prayer-chart">
            <svg
                ref={svg}
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label={t('prayers.chartLabel', { n: days.length })}
                tabIndex={0}
                onPointerMove={(event) => pick(event.clientX)}
                onPointerDown={(event) => pick(event.clientX)}
                onPointerLeave={() => setHover(null)}
                onKeyDown={keys}
                onBlur={() => setHover(null)}
            >
                {ticks.map((m) => (
                    <g key={m}>
                        <line x1={left} x2={left + plotW} y1={y(m)} y2={y(m)} class="grid" />
                        <text x={left - 8} y={y(m) + 4} class="axis" text-anchor="end">{m >= 24 * 60 ? '24:00' : clock(m)}</text>
                    </g>
                ))}
                {xTicks(days).map(({ index, label }) => (
                    <text key={index} x={x(index)} y={H - 8} class="axis" text-anchor={days.length <= 7 ? 'middle' : 'start'}>{label}</text>
                ))}
                {shown && hover !== null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + plotH} class="crosshair" />}
                {PRAYERS.map((prayer) => (
                    <path key={prayer} d={path(prayer)} class={`prayer-line ${prayer}`} />
                ))}
                {shown && hover !== null && PRAYERS.map((prayer) => {
                    const m = shown.times[prayer]
                    return m === undefined ? null : <circle key={prayer} cx={x(hover)} cy={y(m)} r={4} class={`prayer-dot ${prayer}`} />
                })}
                {/* Each line named at its end: the light-mode colours are below 3:1, so the name carries it. */}
                {PRAYERS.map((prayer) => {
                    const m = days[last].times[prayer]
                    return m === undefined ? null : (
                        <text key={prayer} x={left + plotW + 8} y={y(m) + 4} class="axis end-label">{t(NAME[prayer])}</text>
                    )
                })}
            </svg>
            {shown && hover !== null && (
                <div class="chart-tip prayer-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
                    <strong>{dayLabel(shown.date, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
                    {[...PRAYERS].reverse().map((prayer) => (
                        <span key={prayer} class="tip-row">
                            <i class={`key ${prayer}`} aria-hidden="true" />
                            <span>{t(NAME[prayer])}</span>
                            <b>{shown.times[prayer] === undefined ? '—' : clock(shown.times[prayer]!)}</b>
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

export function PrayerChart({ api, device, initialDays = 30 }: { api: Api; device: DeviceSummary; initialDays?: number }) {
    const [phone, setPhone] = useState<(Place & { at: string }) | null | undefined>(undefined)
    const [source, setSource] = useState<string>(PHONE)
    const [period, setPeriod] = useState<number>(initialDays)
    // Read once when the panel opens: which prayer is next today.
    const [nowMinute] = useState(() => { const now = new Date(); return now.getHours() * 60 + now.getMinutes() })

    useEffect(() => {
        let current = true
        // Location events are kept 30 days, so that is as far back as a fix can be.
        api.listEvents(device.deviceId, 'location', new Date(Date.now() - 30 * DAY_MS))
            .then((events) => { if (current) setPhone(lastPlace(events)) })
            .catch(() => { if (current) setPhone(null) })
        return () => { current = false }
    }, [api, device.deviceId])

    useEffect(() => {
        if (phone === null && source === PHONE) setSource(CITIES[0].key)
    }, [phone, source])

    const place: Place | null = source === PHONE ? (phone ?? null) : CITIES.find((c) => c.key === source)?.place ?? null
    const days = useMemo(() => {
        if (!place) return null
        const now = new Date()
        return prayerSeries(new Date(now.getFullYear(), now.getMonth(), now.getDate()), period, place)
    }, [place, period])

    const today = days?.[0]
    const next = today ? PRAYERS.find((p) => (today.times[p] ?? -1) > nowMinute) : undefined

    return (
        <section class="rule-group prayer-times">
            <h2 class="rule-heading">{t('prayers.title')}</h2>
            <div class="card stack">
                <div class="prayer-controls">
                    <label class="prayer-place">
                        <span class="muted small">{t('prayers.where')}</span>
                        <select value={source} onChange={(event) => setSource(event.currentTarget.value)}>
                            {phone && <option value={PHONE}>{t('prayers.phonePlace')}</option>}
                            {CITIES.map((city) => <option key={city.key} value={city.key}>{city.name}</option>)}
                        </select>
                    </label>
                    <div class="seg" role="group" aria-label={t('prayers.periodLabel')}>
                        {PERIODS.map(({ days: n, key }) => (
                            <button key={n} type="button" aria-pressed={period === n} onClick={() => setPeriod(n)}>{t(key)}</button>
                        ))}
                    </div>
                </div>
                {source === PHONE && phone && (
                    <p class="muted small">{t('prayers.phoneFix', { when: new Date(phone.at).toLocaleString(dateLocale()) })}</p>
                )}
                {phone === null && <p class="muted small">{t('prayers.noFix')}</p>}

                {phone === undefined || !days || !today ? (
                    <p class="muted">{t('common.loading')}</p>
                ) : (
                    <>
                        <ul class="prayer-today" aria-label={t('prayers.today')}>
                            {PRAYERS.map((prayer) => (
                                <li key={prayer} class={prayer === next ? 'next' : undefined}>
                                    <span class="prayer-name"><i class={`key ${prayer}`} aria-hidden="true" />{t(NAME[prayer])}</span>
                                    <b>{today.times[prayer] === undefined ? '—' : clock(today.times[prayer]!)}</b>
                                    {prayer === next && <span class="muted small">{t('prayers.next')}</span>}
                                </li>
                            ))}
                        </ul>
                        <div class="legend" aria-hidden="true">
                            {PRAYERS.map((prayer) => <span key={prayer}><i class={`key ${prayer}`} />{t(NAME[prayer])}</span>)}
                        </div>
                        <Chart days={days} />
                        <details>
                            <summary>{t('insights.asTable')}</summary>
                            <div class="table-wrap">
                                <table class="data-table">
                                    <thead>
                                        <tr><th>{t('insights.day')}</th>{PRAYERS.map((p) => <th key={p}>{t(NAME[p])}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {days.map((d) => (
                                            <tr key={d.date}>
                                                <td>{dayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                                                {PRAYERS.map((p) => <td key={p}>{d.times[p] === undefined ? '—' : clock(d.times[p]!)}</td>)}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                        <p class="muted small">{t('prayers.footnote')}</p>
                    </>
                )}
            </div>
        </section>
    )
}
