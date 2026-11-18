package com.manara.agent.update

import android.content.Context

/**
 * The play build updates through Google Play only (Play policy forbids self-updating), so it
 * ignores the server's offer. The direct build's version installs it.
 */
object AgentUpdates {
    const val SELF_UPDATE = false

    @Suppress("UNUSED_PARAMETER")
    fun offered(context: Context, offer: UpdateOffer?) = Unit
}
