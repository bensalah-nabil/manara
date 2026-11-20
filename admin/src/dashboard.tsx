import { useEffect, useState } from 'preact/hooks'
import type { AdminStats, Api } from './api.ts'
import { BarList, ChartCard, ColumnChart, LineChart, SmallMultiples } from './charts.tsx'
import { ALERT_KIND_TEXT, share, weekly } from './model.ts'

const RANGES = [30, 90, 365] as const

/** The admin dashboard (part 2): growth, fleet health, setup funnel, alerts. Totals only. */
export function Dashboard({ api }: { api: Api }) {
    const [days, setDays] = useState<(typeof RANGES)[number]>(90)
    const [stats, setStats] = useState<AdminStats | null>(null)
    const [error, setError] = useState('')
    useEffect(() => {
        let current = true
        setStats(null)
        setError('')
        api.stats(days).then((s) => { if (current) setStats(s) }).catch((e) => { if (current) setError(String(e)) })
        return () => { current = false }
    }, [api, days])

    const header = (
        <div class="row wrap dash-head">
            <h2>Trends</h2>
            <div class="seg" role="group" aria-label="Period">
                {RANGES.map((r) => <button key={r} type="button" aria-pressed={days === r} class={days === r ? 'on' : ''} onClick={() => setDays(r)}>{r === 365 ? '1 year' : `${r} days`}</button>)}
            </div>
        </div>
    )
    if (!stats) return <>{header}{error ? <p role="alert" class="error">{error}</p> : <p class="muted">Loading…</p>}</>

    const f = stats.funnel
    // The alert log is purged after 90 days (main.go's retention sweep), so a longer range would only add empty days.
    const dates = stats.days.map((d) => d.date).slice(-90)
    const kinds = ['tamper', 'silent_phone', 'unknown_call', ...new Set(stats.alerts.map((a) => a.kind).filter((k) => !['tamper', 'silent_phone', 'unknown_call'].includes(k)))]
    const panels = kinds.map((kind) => {
        const byDate = new Map(stats.alerts.filter((a) => a.kind === kind).map((a) => [a.date, a]))
        const undelivered = stats.alerts.filter((a) => a.kind === kind).reduce((n, a) => n + a.undelivered, 0)
        return {
            title: ALERT_KIND_TEXT[kind] ?? kind,
            values: dates.map((d) => byDate.get(d)?.sent ?? 0),
            note: undelivered > 0 ? `${undelivered} not delivered to every destination` : undefined,
        }
    })
    const weeks = weekly(stats.days)

    return (
        <div class="stack">
            {header}
            <div class="charts two">
                <ChartCard title="Phones checking in per day" note="Phones that sent anything to the server that day (Tunisia time).">
                    <LineChart label="Phones checking in" points={stats.days.map((d) => ({ date: d.date, value: d.activePhones }))} />
                </ChartCard>
                <ChartCard title="New accounts and phones per week">
                    <ColumnChart series={['New accounts', 'New phones']} groups={weeks.map((w) => ({ label: w.week, values: [w.newAccounts, w.newPhones] }))} />
                </ChartCard>
            </div>

            <h2>Fleet</h2>
            <div class="charts three">
                <ChartCard title="Manara versions"><BarList label="Manara version" items={stats.versions} /></ChartCard>
                <ChartCard title="Android versions"><BarList label="Android version" items={stats.android} /></ChartCard>
                <ChartCard title="Brands"><BarList label="Brand" items={stats.brands} /></ChartCard>
            </div>

            <h2>Guided setup</h2>
            <div class="charts two">
                <ChartCard title="How far setup went" note="Every phone ever added; a phone set up by QR code has no guided setup.">
                    <BarList label="Stage" valueText={(n) => `${n} · ${share(n, f.phones)}`} items={[
                        { label: 'Phones added', count: f.phones },
                        { label: 'Guided setup started', count: f.setupStarted },
                        { label: 'Finished', count: f.finished },
                        { label: 'Waiting for the parent', count: f.waitingForParent },
                        { label: 'Still running', count: f.inProgress },
                        { label: 'Failed', count: f.failed },
                    ]} />
                </ChartCard>
                <ChartCard title="Why setups failed" note="The phone's last message for each failed setup, most common first.">
                    <BarList label="Message" items={stats.failures} />
                </ChartCard>
            </div>

            <h2>Alerts to parents</h2>
            {stats.emailsFailing > 0 && (
                <p role="alert" class="status-line serious"><span aria-hidden="true">⚠</span> <b>Email failing:</b> {stats.emailsFailing === 1 ? '1 parent is' : `${stats.emailsFailing} parents are`} owed an alert email that keeps failing to send. Check Brevo (Render logs).</p>
            )}
            <ChartCard title={`Alerts sent, last ${dates.length} days`} note="Counted since the alert log was added (November 2026); kept 90 days. Same scale in every panel.">
                <SmallMultiples days={dates} panels={panels} />
            </ChartCard>
        </div>
    )
}
