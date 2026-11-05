/** The browser keeps the whole policy and replaces one section. The server still drops fields its own Policy struct lacks, so a new field must be added there too. */
export type Policy = { version: number } & Record<string, unknown>

export function withSection(policy: Policy, key: string, section: unknown): Policy {
    return { ...policy, [key]: section }
}
