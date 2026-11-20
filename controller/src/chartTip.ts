/**
 * Where a chart's tooltip sits: over the hovered column at the top of the plot, kept inside the
 * chart at both ends ([fraction] is the column's place across the chart, 0 to 1). It used to sit
 * above the chart, where the box that scrolls the chart on a phone clipped it out of sight.
 */
export function tipStyle(fraction: number): Record<string, string> {
    const shift = fraction < 0.2 ? '0%' : fraction > 0.8 ? '-100%' : '-50%'
    return { left: `${fraction * 100}%`, transform: `translateX(${shift})` }
}
