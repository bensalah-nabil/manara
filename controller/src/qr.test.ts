import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QUIET_ZONE, qrMatrix, qrPath } from './qr.ts'

const TOKEN = '750f40a99f652acdabd8a58fa9e06ce388103ec903a7cb34018b8c8cc36d8d07'

function finderIsPresentAt(matrix: boolean[][], top: number, left: number): boolean {
    // 7x7 finder: dark ring, light ring, dark 3x3 centre.
    for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
            const ring = Math.max(Math.abs(y - 3), Math.abs(x - 3))
            const dark = ring !== 2
            if (matrix[top + y][left + x] !== dark) return false
        }
    }
    return true
}

test('the matrix is square with a valid QR size', () => {
    const matrix = qrMatrix(TOKEN)
    assert.equal(matrix.length, 37)
    assert.ok(matrix.every((row) => row.length === matrix.length))
    assert.equal((matrix.length - 17) % 4, 0)
})

test('the three finder patterns scanners lock onto are in the right corners', () => {
    const matrix = qrMatrix(TOKEN)
    const last = matrix.length - 7
    assert.ok(finderIsPresentAt(matrix, 0, 0), 'top-left')
    assert.ok(finderIsPresentAt(matrix, 0, last), 'top-right')
    assert.ok(finderIsPresentAt(matrix, last, 0), 'bottom-left')
    assert.equal(finderIsPresentAt(matrix, last, last), false, 'bottom-right must not look like a finder')
})

test('the same text always gives the same symbol, and different text gives a different one', () => {
    assert.deepEqual(qrMatrix(TOKEN), qrMatrix(TOKEN))
    assert.notDeepEqual(qrMatrix(TOKEN), qrMatrix(TOKEN.replace('7', '8')))
})

test('empty text is refused rather than drawing a meaningless symbol', () => {
    assert.throws(() => qrMatrix(''), /Nothing to encode/)
})

test('the path covers exactly the dark modules, inside the quiet zone', () => {
    const matrix = qrMatrix(TOKEN)
    const { size, d } = qrPath(matrix)
    assert.equal(size, matrix.length + QUIET_ZONE * 2)
    const dark = matrix.flat().filter(Boolean).length
    let covered = 0
    for (const match of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
        const [x, y, width, back] = [match[1], match[2], match[3], match[4]].map(Number)
        assert.equal(width, back)
        assert.ok(x >= QUIET_ZONE && y >= QUIET_ZONE && x + width <= size - QUIET_ZONE && y < size - QUIET_ZONE)
        for (let i = 0; i < width; i++) assert.equal(matrix[y - QUIET_ZONE][x - QUIET_ZONE + i], true)
        covered += width
    }
    assert.equal(covered, dark)
})

test('an all-light matrix gives an empty path, and a custom quiet zone is honoured', () => {
    assert.deepEqual(qrPath([[false, false], [false, false]], 1), { size: 4, d: '' })
    assert.equal(qrPath([[true]], 2).d, 'M2 2h1v1h-1z')
})
