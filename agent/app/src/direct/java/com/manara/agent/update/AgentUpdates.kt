package com.manara.agent.update

import android.content.Context
import com.manara.agent.BuildConfig

/**
 * Self-update of the directly downloaded build (`direct` only: Google Play forbids an app updating
 * itself outside Play, so the play build has a stand-in that does nothing).
 *
 * Every successful sync passes on what the server offers. A newer version is fetched and installed
 * by [UpdateWorker], on Wi-Fi while charging; nothing offered, or nothing newer, cancels it.
 */
object AgentUpdates {
    const val SELF_UPDATE = true

    fun offered(context: Context, offer: UpdateOffer?) {
        val store = UpdateStore(context)
        store.save(offer)
        if (offer == null || offer.versionCode <= BuildConfig.VERSION_CODE) {
            UpdateWorker.cancel(context)
            store.apkFile.delete()
            return
        }
        UpdateWorker.enqueue(context)
    }
}
