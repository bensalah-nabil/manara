import { useState } from 'preact/hooks'
import { tipStyle } from './chartTip.ts'
import type { DayCount } from './dayCounts.ts'
import { dateLocale, t } from './i18n.ts'

/**
 * Counts per day as columns, by the dataviz "emphasis" form: the part the chart is about in the
 * brand colour, the rest in grey, a 2px gap between them, 4px rounded data ends, one axis. Either
 * stacked (calls: unknown numbers at the base, other calls above) or on both sides of the line
 * (apps installed above, removed below). A tooltip per day and a table view, like the screen-time chart.
 */
interface Props {
    days: DayCount[]
    /** The chart's accessible name. */
    label: string
    mainName: string
    /** Absent: one series, every count is the main part, no legend. */
    contextName?: string
    /** The grey part below the line instead of stacked on top. */
    below?: boolean
    /** The day in words, for the tooltip and the table: "3 calls, 1 from an unknown number". */
    describe: (day: DayCount) => string
}

// A narrower canvas than the screen-time chart's: these sit in half-width cards and don't scroll,
// so their labels stay readable (about 13px in a 440px card).
const W = 480, LEFT = 30, RIGHT = 6, TOP = 10, BOTTOM = 26
const GAP = 2

/** A whole-number top for the axis: the count itself when small, else 5, 10, 20, 50 ... */
function axisTop(value: number): number {
    if (value <= 5) return Math.max(1, value)
    const power = 10 ** Math.floor(Math.log10(value))
    return ([1, 2, 5, 10].map((m) => m * power).find((m) => m >= value)) ?? 10 * power
}

/** A column from [base] to [end], its data end rounded (4px) when [round], its base square. */
function column(x: number, w: number, base: number, end: number, round: boolean): string {
    const h = Math.abs(base - end)
    if (h < 0.5 || w <= 0) return ''
    if (!round) return `M${x},${base}V${end}H${x + w}V${base}Z`
    const r = Math.min(4, w / 2, h)
    const s = end < base ? 1 : -1 // up or down
    return `M${x},${base}V${end + s * r}Q${x},${end} ${x + r},${end}H${x + w - r}Q${x + w},${end} ${x + w},${end + s * r}V${base}Z`
}

function dayLabel(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' })
}

export function DayColumns({ days, label, mainName, contextName, below = false, describe }: Props) {
    const [hover, setHover] = useState<number | null>(null)
    const two = contextName !== undefined
    const upTop = axisTop(Math.max(...days.map((d) => d.main + (two && !below ? d.context : 0))))
    const downTop = two && below ? axisTop(Math.max(0, ...days.map((d) => d.context))) : 0
    const H = below ? 170 : 150
    const plotH = H - TOP - BOTTOM
    // One axis: the same minutes-per-pixel above and below the line.
    const unit = plotH / (upTop + (downTop || 0))
    const base = TOP + upTop * unit
    const slot = (W - LEFT - RIGHT) / days.length
    const barW = Math.max(2, slot - GAP)
    const hovered = hover === null ? null : days[hover]
    const ticks: [number, string][] = [[base, '0'], [base - upTop * unit, String(upTop)]]
    if (downTop) ticks.push([base + downTop * unit, String(downTop)])

    return (
        <div class="stack">
            {two && (
                <div class="chart-legend" aria-hidden="true">
                    <span><i class="key main" />{mainName}</span>
                    <span><i class="key context" />{contextName}</span>
                </div>
            )}
            <div class="chart">
                <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
                    {ticks.map(([y, text]) => (
                        <g key={y}>
                            <line x1={LEFT} x2={W - RIGHT} y1={y} y2={y} class="grid" />
                            <text x={LEFT - 6} y={y + 5} class="axis" text-anchor="end">{text}</text>
                        </g>
                    ))}
                    {days.map((d, i) => {
                        const x = LEFT + i * slot + GAP / 2
                        const mainEnd = base - d.main * unit
                        const stacked = two && !below && d.context > 0
                        // Stacked: the grey part starts 2px above the brand one, so the two never touch.
                        const contextFrom = d.main > 0 ? mainEnd - GAP : base
                        const contextEnd = below ? base + d.context * unit : base - (d.main + d.context) * unit
                        const total = d.main + d.context
                        return (
                            <g key={d.date}>
                                {d.main > 0 && <path d={column(x, barW, base, mainEnd, !stacked)} class={`bar high ${hover === i ? 'hovered' : ''}`} />}
                                {two && d.context > 0 && (
                                    <path d={column(x, barW, below ? base + (d.main > 0 ? GAP / 2 : 0) : contextFrom, contextEnd, true)} class={`bar ${hover === i ? 'hovered' : ''}`} />
                                )}
                                {/* The whole day's height answers the pointer, drawn last so the bars don't steal it. */}
                                <rect
                                    x={LEFT + i * slot} y={TOP} width={slot} height={plotH} class="hit"
                                    tabIndex={total > 0 ? 0 : -1}
                                    aria-label={`${dayLabel(d.date)}: ${describe(d)}`}
                                    onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
                                    onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                                />
                            </g>
                        )
                    })}
                    {days.map((d, i) => (i % 7 === (days.length - 1) % 7) && (
                        <text key={d.date} x={LEFT + i * slot + slot / 2} y={H - 8} class="axis" text-anchor="middle">
                            {i === days.length - 1 ? t('insights.today') : new Date(d.date + 'T12:00:00').toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
                        </text>
                    ))}
                </svg>
                {hovered && hover !== null && (
                    <div class="chart-tip" style={tipStyle((LEFT + hover * slot + slot / 2) / W)}>
                        <strong>{dayLabel(hovered.date)}</strong>
                        <span>{describe(hovered)}</span>
                    </div>
                )}
            </div>
            <details>
                <summary>{t('insights.asTable')}</summary>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>{t('insights.day')}</th><th>{mainName}</th>{two && <th>{contextName}</th>}</tr></thead>
                        <tbody>
                            {[...days].reverse().filter((d) => d.main + d.context > 0).map((d) => (
                                <tr key={d.date}><td>{dayLabel(d.date)}</td><td>{d.main}</td>{two && <td>{d.context}</td>}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </div>
    )
}
