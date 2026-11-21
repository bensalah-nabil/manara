import { useEffect, useState } from 'preact/hooks'
import type { Api, AssistantUsageView } from './api.ts'
import { ChartCard, LineChart } from './charts.tsx'
import { tokens, usd } from './model.ts'

/**
 * The setup assistant's use and cost (docs/setup-assistant.md): totals, questions per day, and each
 * account, most expensive first. Counts only: the server never stores a question. Cost is an
 * estimate from list prices; Anthropic's console has the bill.
 */
const PERIODS = [7, 30, 90, 365]

export function AssistantView({ api }: { api: Api }) {
    const [days, setDays] = useState(30)
    const [view, setView] = useState<AssistantUsageView | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        let current = true
        setView(null)
        setError('')
        api.assistantUsage(days)
            .then((v) => { if (current) setView(v) })
            .catch((e) => { if (current) setError(e instanceof Error ? e.message : String(e)) })
        return () => { current = false }
    }, [api, days])

    const period = (
        <div class="row wrap dash-head">
            <h2>Setup assistant</h2>
            <div class="seg" role="group" aria-label="Period">
                {PERIODS.map((n) => (
                    <button key={n} type="button" class={n === days ? 'on' : ''} aria-pressed={n === days} onClick={() => setDays(n)}>
                        {n === 365 ? '1 year' : `${n} days`}
                    </button>
                ))}
            </div>
        </div>
    )
    if (!view) return <>{period}{error ? <p role="alert" class="error">{error}</p> : <p class="muted">Loading…</p>}</>

    const t = view.total
    const perQuestion = t.questions > 0 ? t.costUsd / t.questions : 0
    const tiles: [string, string, string][] = [
        ['Questions', String(t.questions), `${view.accounts.length} account${view.accounts.length === 1 ? '' : 's'} asked`],
        ['Estimated cost', usd(t.costUsd), t.priceKnown ? `over ${days} days` : 'some use has no known price'],
        ['Per question', usd(perQuestion), 'on average'],
        ['Tokens in / out', `${tokens(t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens)} / ${tokens(t.outputTokens)}`, `${tokens(t.cacheReadTokens)} read from cache`],
    ]

    return (
        <>
            {period}
            <p class="muted small">
                Model now: <code>{view.model || 'unknown'}</code>. Cost is estimated from list prices; the bill is in Anthropic's console.
                Counts only: questions are never stored.
            </p>
            <div class="tiles">
                {tiles.map(([label, value, note]) => (
                    <div key={label} class={label === 'Estimated cost' && !t.priceKnown ? 'tile warn' : 'tile'}>
                        <span class="muted small">{label}</span><b>{value}</b><span class="muted small">{note}</span>
                    </div>
                ))}
            </div>

            <ChartCard title="Questions per day" note="Days in Tunisia time.">
                <LineChart label="Questions" points={view.perDay.map((d) => ({ date: d.day.slice(0, 10), value: d.questions }))} />
            </ChartCard>

            <details class="table-view">
                <summary>Cost per day</summary>
                <div class="scroll">
                    <table>
                        <thead><tr><th>Day</th><th>Questions</th><th>Tokens in</th><th>Tokens out</th><th>Cost</th></tr></thead>
                        <tbody>
                            {view.perDay.filter((d) => d.questions > 0).reverse().map((d) => (
                                <tr key={d.day}>
                                    <td>{d.day.slice(0, 10)}</td><td>{d.questions}</td>
                                    <td>{tokens(d.inputTokens + d.cacheReadTokens + d.cacheWriteTokens)}</td><td>{tokens(d.outputTokens)}</td>
                                    <td>{usd(d.costUsd)}{d.priceKnown ? '' : ' *'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>

            <h2>Per account</h2>
            {view.accounts.length === 0 ? <p class="muted">No questions in this period.</p> : (
                <div class="scroll">
                    <table>
                        <thead><tr><th>Account</th><th>Questions</th><th>Tokens in</th><th>Tokens out</th><th>Cost</th><th>Last used</th></tr></thead>
                        <tbody>
                            {view.accounts.map((a) => (
                                <tr key={a.accountId}>
                                    <td>{a.email || a.accountId}{a.models.length > 1 && <span class="muted small"> ({a.models.join(', ')})</span>}</td>
                                    <td>{a.questions}</td>
                                    <td>{tokens(a.inputTokens + a.cacheReadTokens + a.cacheWriteTokens)}</td>
                                    <td>{tokens(a.outputTokens)}</td>
                                    <td>{usd(a.costUsd)}{a.priceKnown ? '' : ' *'}</td>
                                    <td>{a.lastDay.slice(0, 10)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {!t.priceKnown && <p class="muted small">* Includes a model with no price in the server's list: its cost isn't counted.</p>}
            <p class="muted small">The assistant allows 30 questions a day per account. A parent near that every day is worth a call.</p>
        </>
    )
}
