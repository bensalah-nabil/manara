import { useMemo } from 'react'
import { qrMatrix, qrPath } from './qr.ts'

/** Drawn as vector paths, never as HTML text. Always dark on white so it scans on a dark page too. */
export function QrCode({ value, label }: { value: string; label: string }) {
    const symbol = useMemo(() => qrPath(qrMatrix(value)), [value])
    return (
        <svg
            className="qr"
            role="img"
            aria-label={label}
            viewBox={`0 0 ${symbol.size} ${symbol.size}`}
            shapeRendering="crispEdges"
        >
            <rect width={symbol.size} height={symbol.size} fill="#fff" />
            <path d={symbol.d} fill="#000" />
        </svg>
    )
}
