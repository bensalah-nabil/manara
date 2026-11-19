import { createStandardPublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser'
import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser'

const TENANT = import.meta.env.VITE_ENTRA_TENANT_ID ?? ''
const CLIENT = import.meta.env.VITE_ENTRA_CLIENT_ID ?? ''
/** The API permission defined under "Expose an API" (docs/admin-console.md). */
export const SCOPE = `api://${CLIENT}/Admin.Access`

export const configured = TENANT !== '' && CLIENT !== ''

export interface Auth {
    account: AccountInfo | null
    signIn(): Promise<void>
    signOut(): Promise<void>
    token(): Promise<string>
}

/**
 * Microsoft Entra ID sign-in (authorization code with PKCE, by MSAL). Tokens live in
 * sessionStorage: closing the tab signs the admin out of this console.
 */
export async function startAuth(): Promise<Auth> {
    const msal: IPublicClientApplication = await createStandardPublicClientApplication({
        auth: {
            clientId: CLIENT,
            authority: `https://login.microsoftonline.com/${TENANT}`,
            redirectUri: window.location.origin,
            postLogoutRedirectUri: window.location.origin,
        },
        cache: { cacheLocation: 'sessionStorage' },
    })
    const result = await msal.handleRedirectPromise()
    if (result?.account) msal.setActiveAccount(result.account)
    const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null
    if (account) msal.setActiveAccount(account)

    return {
        account,
        signIn: () => msal.loginRedirect({ scopes: [SCOPE] }),
        signOut: () => msal.logoutRedirect({ account: msal.getActiveAccount() }),
        async token() {
            const active = msal.getActiveAccount()
            if (!active) throw new Error('not signed in')
            try {
                return (await msal.acquireTokenSilent({ scopes: [SCOPE], account: active })).accessToken
            } catch (error) {
                if (error instanceof InteractionRequiredAuthError) {
                    await msal.acquireTokenRedirect({ scopes: [SCOPE], account: active })
                }
                throw error
            }
        },
    }
}
