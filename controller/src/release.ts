/** "1234 5678": easier to read out and type on the phone. */
export function releaseCodeText(code: string): string {
    return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : code
}

/** Whole minutes left before the code changes, at least 1 while it still works. */
export function minutesLeft(validUntil: string, now: number = Date.now()): number {
    const end = Date.parse(validUntil)
    if (Number.isNaN(end) || end <= now) return 0
    return Math.max(1, Math.floor((end - now) / 60000))
}
