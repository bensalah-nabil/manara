import { tn } from './i18n.ts'
/** The token in an emailed reset link: `#reset=<64 hex>`. Anything else is not a reset link. */
export function resetToken(hash: string): string | null {
    const match = /^#?reset=([0-9a-f]{64})$/.exec(hash.trim())
    return match ? match[1] : null
}

/** What the parent types to confirm, so a stray click can't erase the account. */
export const DELETE_WORD = 'DELETE'

/** Deleting needs no phones left, the password, and the word typed out. */
export function canDelete(phones: number, password: string, typed: string): boolean {
    return phones === 0 && password.length > 0 && typed.trim() === DELETE_WORD
}

export function phonesLeftText(phones: number): string {
    return tn('account.phonesLeft', phones)
}
