package com.manara.tools.orphanaccountcleaner

import android.app.Service
import android.content.Intent
import android.os.IBinder

/**
 * One thin Service per account type (see AndroidManifest.xml's comment) --
 * Android requires a distinct component class per <service> declaration,
 * even though all five just bind the same NoOpAuthenticator.
 */
private fun bindAuthenticator(service: Service): IBinder = NoOpAuthenticator(service).iBinder

class WhatsAppAuthenticatorService : Service() {
    override fun onBind(intent: Intent?): IBinder = bindAuthenticator(this)
}

class TachyonAuthenticatorService : Service() {
    override fun onBind(intent: Intent?): IBinder = bindAuthenticator(this)
}

class TruecallerAuthenticatorService : Service() {
    override fun onBind(intent: Intent?): IBinder = bindAuthenticator(this)
}

class FacebookLoginAuthenticatorService : Service() {
    override fun onBind(intent: Intent?): IBinder = bindAuthenticator(this)
}

class FacebookMessengerAuthenticatorService : Service() {
    override fun onBind(intent: Intent?): IBinder = bindAuthenticator(this)
}

class GoogleAuthenticatorService : Service() {
    override fun onBind(intent: Intent?): IBinder = bindAuthenticator(this)
}
