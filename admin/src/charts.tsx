import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { niceMax } from './model.ts'

/**
 * The admin dashboard's charts (part 2), in plain SVG, by the dataviz method: thin marks, 4px rounded
 * data ends anchored to the baseline, hairline grid, one axis, a hover layer, a legend for two
 * series, and a table view for every chart. Colours are tokens (styles.css, --series-*), validated
 * against this app's surfaces in both modes.
 */

const W = 640
const PAD = { top: 12, right: 12, bottom: 26, left: 40 }

/** A bar with its data end rounded (4px) and its baseline end square. */
function barPath(x: number, y: number, w: number, base: number): string {
    const h = base - y
    if (h <= 0 || w <= 0) return ''
    const r = Math.min(4, w / 2, h)
    return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`
}

function Grid({ max, height, format = String }: { max: number; height: number; format?: (n: number) => string }) {
    // A middle line only where it falls on a whole number: max 5 would label 2.5 as "3".
    const lines = max % 2 === 0 ? [0, 0.5, 1] : [0, 1]
    return (
        <g>
            {lines.map((f) => {
                const y = PAD.top + (1 - f) * (height - PAD.top - PAD.bottom)
                return (
                    <g key={f}>
                        <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} class={f === 0 ? 'axis' : 'grid'} />
                        <text x={PAD.left - 6} y={y + 4} text-anchor="end" class="tick">{format(Math.round(max * f))}</text>
                    </g>
                )
            })}
        </g>
    )
}

function TableView({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
    return (
        <details class="table-view">
            <summary>Show as a table</summary>
            <div class="scroll">
                <table>
                    <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
                </table>
            </div>
        </details>
    )
}

export function ChartCard({ title, note, children }: { title: string; note?: string; children: ComponentChildren }) {
    return (
        <section class="card chart">
            <h3>{title}</h3>
            {note && <p class="muted small">{note}</p>}
            {children}
        </section>
    )
}

function shortDate(iso: string): string {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** One series over days: a 2px line with a faint area, a crosshair and a tooltip on hover. */
export function LineChart({ points, label }: { points: { date: string; value: number }[]; label: string }) {
    const [hover, setHover] = useState<number | null>(null)
    const H = 200
    const max = niceMax(Math.max(0, ...points.map((p) => p.value)))
    const plotW = W - PAD.left - PAD.right
    const x = (i: number) => PAD.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
    const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
    const base = H - PAD.bottom
    const area = points.length > 0 ? `${line}L${x(points.length - 1)},${base}L${x(0)},${base}Z` : ''
    const ticks = points.length > 0 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : []
    function onMove(event: PointerEvent) {
        const svg = event.currentTarget as SVGSVGElement
        const box = svg.getBoundingClientRect()
        const vx = ((event.clientX - box.left) / box.width) * W
        const i = Math.round(((vx - PAD.left) / plotW) * (points.length - 1))
        setHover(i >= 0 && i < points.length ? i : null)
    }
    const h = hover === null ? null : points[hover]
    return (
        <div class="viz">
            <div class="plot">
                <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, ${points.length} days`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
                    <Grid max={max} height={H} />
                    <path d={area} class="area s1" />
                    <path d={line} class="line s1" />
                    {ticks.map((i) => <text key={i} x={x(i)} y={H - 8} text-anchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} class="tick">{shortDate(points[i].date)}</text>)}
                    {h && hover !== null && (
                        <g>
                            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={base} class="crosshair" />
                            <circle cx={x(hover)} cy={y(h.value)} r={4.5} class="dot s1" />
                        </g>
                    )}
                </svg>
                {h && hover !== null && (
                    <div class="tooltip" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
                        <b>{h.value}</b> {label.toLowerCase()}<br /><span class="muted">{shortDate(h.date)}</span>
                    </div>
                )}
            </div>
            <TableView head={['Day', label]} rows={points.map((p) => [p.date, p.value])} />
        </div>
    )
}

/** Two series per group, side by side, with a 2px gap; legend above; tooltip per bar. */
export function ColumnChart({ groups, series }: { groups: { label: string; values: [number, number] }[]; series: [string, string] }) {
    const [hover, setHover] = useState<{ g: number; s: number } | null>(null)
    const H = 200
    const max = niceMax(Math.max(0, ...groups.flatMap((g) => g.values)))
    const plotW = W - PAD.left - PAD.right
    const slot = groups.length > 0 ? plotW / groups.length : plotW
    const barW = Math.max(2, Math.min(18, (slot - 8) / 2 - 1))
    const base = H - PAD.bottom
    const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
    const every = Math.max(1, Math.ceil(groups.length / 6))
    const hv = hover === null ? null : { group: groups[hover.g], s: hover.s }
    return (
        <div class="viz">
            <div class="legend" aria-hidden="true">
                <span><i class="swatch s1" />{series[0]}</span>
                <span><i class="swatch s2" />{series[1]}</span>
            </div>
            <div class="plot">
                <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${series[0]} and ${series[1]} per week`} onPointerLeave={() => setHover(null)}>
                    <Grid max={max} height={H} />
                    {groups.map((g, gi) => {
                        const cx = PAD.left + gi * slot + slot / 2
                        return (
                            <g key={g.label}>
                                {g.values.map((v, si) => {
                                    const bx = si === 0 ? cx - barW - 1 : cx + 1
                                    return (
                                        <g key={si} onPointerEnter={() => setHover({ g: gi, s: si })}>
                                            <rect x={bx - 1} y={PAD.top} width={barW + 2} height={base - PAD.top} class="hit" />
                                            <path d={barPath(bx, y(v), barW, base)} class={`bar s${si + 1}${hover && (hover.g !== gi || hover.s !== si) ? ' dim' : ''}`} />
                                        </g>
                                    )
                                })}
                                {gi % every === 0 && <text x={cx} y={H - 8} text-anchor="middle" class="tick">{shortDate(g.label)}</text>}
                            </g>
                        )
                    })}
                </svg>
                {hv && hover && (
                    <div class="tooltip" style={{ left: `${((PAD.left + hover.g * slot + slot / 2) / W) * 100}%` }} role="status">
                        <b>{hv.group.values[hv.s]}</b> {series[hv.s].toLowerCase()}<br /><span class="muted">week of {shortDate(hv.group.label)}</span>
                    </div>
                )}
            </div>
            <TableView head={['Week of', series[0], series[1]]} rows={groups.map((g) => [g.label, g.values[0], g.values[1]])} />
        </div>
    )
}

/**
 * Sorted horizontal bars, one colour; each value written beside its bar in ink. Plain HTML, not SVG,
 * so the text stays readable however narrow the card is.
 */
export function BarList({ items, label, valueText }: { items: { label: string; count: number }[]; label: string; valueText?: (count: number) => string }) {
    const [hover, setHover] = useState<number | null>(null)
    const max = Math.max(1, ...items.map((i) => i.count))
    if (items.length === 0) return <p class="muted">Nothing yet.</p>
    return (
        <div class="viz">
            <div class="barlist" role="img" aria-label={`${label}: ` + items.map((i) => `${i.label} ${i.count}`).join(', ')} onPointerLeave={() => setHover(null)}>
                {items.map((item, i) => (
                    <div key={item.label} class={hover !== null && hover !== i ? 'barrow dim' : 'barrow'} onPointerEnter={() => setHover(i)}>
                        <span class="bl-label" title={item.label}>{item.label}</span>
                        <span class="bl-track"><span class="bl-bar" style={{ width: `${Math.max(item.count > 0 ? 1.5 : 0, (item.count / max) * 100)}%` }} /></span>
                        <span class="bl-value">{valueText ? valueText(item.count) : item.count}</span>
                    </div>
                ))}
            </div>
            <TableView head={[label, 'Count']} rows={items.map((i) => [i.label, valueText ? valueText(i.count) : i.count])} />
        </div>
    )
}

/** Small multiples: one tiny column chart per kind over the same days and the same scale. */
export function SmallMultiples({ days, panels }: { days: string[]; panels: { title: string; values: number[]; note?: string }[] }) {
    const H = 70
    const max = niceMax(Math.max(1, ...panels.flatMap((p) => p.values)))
    const slot = (W - 8) / Math.max(1, days.length)
    const barW = Math.max(1, slot - 2)
    return (
        <div class="viz">
        <div class="multiples">
            {panels.map((p) => {
                const total = p.values.reduce((a, b) => a + b, 0)
                return (
                    <div key={p.title} class="multiple">
                        <div class="multiple-head"><span>{p.title}</span><b>{total}</b></div>
                        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.title}: ${total} in ${days.length} days`}>
                            <line x1={0} x2={W} y1={H - 2} y2={H - 2} class="axis" />
                            {p.values.map((v, i) => v > 0 && (
                                <path key={i} d={barPath(4 + i * slot, 2 + (1 - v / max) * (H - 6), barW, H - 2)} class="bar s1"><title>{`${days[i]}: ${v}`}</title></path>
                            ))}
                        </svg>
                        {p.note && <p class="muted small">{p.note}</p>}
                    </div>
                )
            })}
        </div>
            <TableView head={['Day', ...panels.map((p) => p.title)]} rows={days.map((d, i) => [d, ...panels.map((p) => p.values[i])]).filter((r) => r.slice(1).some((v) => Number(v) > 0))} />
        </div>
    )
}
