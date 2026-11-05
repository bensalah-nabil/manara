import qrcode from 'qrcode-generator'

/** Quiet zone in modules. The QR specification asks for at least 4 around the symbol; scanners rely on it. */
export const QUIET_ZONE = 4

/** Dark modules as a square grid. Byte mode keeps the text exactly as typed, which is what the agent's scanner returns. */
export function qrMatrix(text: string): boolean[][] {
    if (text === '') throw new Error('Nothing to encode')
    const code = qrcode(0, 'M')
    code.addData(text, 'Byte')
    code.make()
    const size = code.getModuleCount()
    return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => code.isDark(row, col)))
}

export interface QrPath {
    /** Side length in modules, including the quiet zone on both sides. */
    size: number
    /** SVG path data: one rectangle per horizontal run of dark modules. */
    d: string
}

export function qrPath(matrix: boolean[][], quietZone = QUIET_ZONE): QrPath {
    const parts: string[] = []
    matrix.forEach((row, y) => {
        let x = 0
        while (x < row.length) {
            if (!row[x]) {
                x += 1
                continue
            }
            const start = x
            while (x < row.length && row[x]) x += 1
            parts.push(`M${start + quietZone} ${y + quietZone}h${x - start}v1h${start - x}z`)
        }
    })
    return { size: matrix.length + quietZone * 2, d: parts.join('') }
}
