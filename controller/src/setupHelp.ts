// The setup assistant's logic, kept apart from its panel (SetupHelp.tsx) so it can be tested.
// The server removes codes, numbers and emails anyway (backend/internal/setuphelp); the console
// warns first, so the parent learns not to type them.
import type { MessageKey } from './i18n.ts'
import type { SetupHelpRequest } from './api.ts'

export interface HelpTurn {
    role: 'parent' | 'assistant'
    text: string
}

/** Earlier turns sent with a question; the server keeps the same number. */
export const HISTORY_TURNS = 6
export const MAX_QUESTION = 1000

/**
 * True when the text holds what shouldn't be sent: an email address or six or more digits in a
 * row, in any script (Arabic-Indic ٠-٩ too: \d alone is ASCII), with the separators people put in
 * numbers. The same rule as the server's Redact (backend/internal/setuphelp).
 */
export function looksPrivate(text: string): boolean {
    if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return true
    for (const run of text.match(/\+?\p{Nd}[\p{Nd}\s.:,/()_-]{4,}\p{Nd}/gu) ?? []) {
        if ((run.match(/\p{Nd}/gu) ?? []).length >= 6) return true
    }
    return false
}

export interface HelpContext {
    step: string
    status: string
    maker: string
    language: string
}

export function helpRequest(question: string, turns: HelpTurn[], context: HelpContext): SetupHelpRequest {
    return {
        question: question.trim().slice(0, MAX_QUESTION),
        ...context,
        history: turns.slice(-HISTORY_TURNS).map(({ role, text }) => ({ role, text })),
    }
}

/** Questions offered as one tap, for where the parent is. */
export function suggestions(step: string, status: string): MessageKey[] {
    if (status === 'failed') return ['help.q.failed', 'help.q.restart']
    switch (step) {
        case 'add_phone':
        case 'before':
        case 'linked':
            return ['help.q.buildNumber', 'help.q.playProtect', 'help.q.googleBack']
        case 'pairing':
            return ['help.q.pairing', 'help.q.debuggingOff']
        case 'checking_accounts':
        case 'waiting_for_accounts':
        case 'removing_app_accounts':
            return ['help.q.whichAccounts', 'help.q.googleBack']
        case 'device_owner':
        case 'restoring_apps':
        case 'reconnecting':
            return ['help.q.signBack', 'help.q.notYet']
        default:
            return ['help.q.notReporting']
    }
}

/** What to tell the parent when a question fails, by the server's error code or HTTP status. */
export function failureKey(code: string, status: number): MessageKey {
    if (status === 429) return 'help.err.limit'
    if (code === 'assistant_quota') return 'help.err.quota'
    if (code === 'assistant_busy') return 'help.err.busy'
    if (code === 'assistant_declined') return 'help.err.declined'
    if (code === 'assistant_unavailable') return 'help.err.off'
    if (code === 'network') return 'help.err.network'
    return 'help.err.failed'
}

/** The answer as plain text: models sometimes write Markdown (bold stars, headings) anyway. */
export function plainAnswer(text: string): string {
    return text
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*]\s+/gm, '• ')
        .replace(/\*\*/g, '')
        .trim()
}
