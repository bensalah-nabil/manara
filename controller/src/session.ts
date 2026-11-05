const KEY = 'manara.parentSession'

type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The token lives in memory first, so a blocked or full storage still allows this tab to work. */
export function createSessionStore(storage: TokenStorage) {
    let memory: string | null = null

    return {
        get(): string | null {
            if (memory) return memory
            try {
                return storage.getItem(KEY)
            } catch {
                return null
            }
        },

        set(token: string): void {
            memory = token
            try {
                storage.setItem(KEY, token)
            } catch {
                // Storage unavailable: the in-memory copy keeps this tab signed in.
            }
        },

        clear(): void {
            memory = null
            try {
                storage.removeItem(KEY)
            } catch {
                // Nothing stored, or storage unavailable.
            }
        },
    }
}
