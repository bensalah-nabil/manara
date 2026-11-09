package com.manara.agent.provision

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.PersistableBundle
import android.util.Log

/**
 * Android asks which mode to set up (ACTION_GET_PROVISIONING_MODE, Android 12+). Manara answers
 * "fully managed": the whole phone, as with guided setup. Shown by Android's own setup screens,
 * which tell whoever holds the phone that it will be managed.
 */
class GetProvisioningModeActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val fullyManaged = DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
        val allowed = intent.getIntegerArrayListExtra(DevicePolicyManager.EXTRA_PROVISIONING_ALLOWED_PROVISIONING_MODES)
        if (QrProvisioning.acceptsFullyManaged(allowed, fullyManaged)) {
            setResult(RESULT_OK, Intent().putExtra(DevicePolicyManager.EXTRA_PROVISIONING_MODE, fullyManaged))
        } else {
            Log.w(TAG, "fully managed not offered: $allowed")
            setResult(RESULT_CANCELED)
        }
        finish()
    }
}

/**
 * The last step of QR setup (ACTION_ADMIN_POLICY_COMPLIANCE): Manara is device owner now. Saves the
 * parent's connection code from the QR code's extras and joins the account in the background, so
 * setup returns to Android at once even if the network is slow.
 */
class PolicyComplianceActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val extras = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE, PersistableBundle::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
        }
        val token = QrProvisioning.tokenFrom(extras?.getString(QrProvisioning.TOKEN_KEY))
        if (token == null) {
            // Still managed: the parent can enter a code in Manara, as after guided setup.
            Log.w(TAG, "no connection code in the QR extras")
        } else {
            PendingEnrollment(this).save(token)
            PendingEnrollmentWorker.enqueue(this)
        }
        setResult(RESULT_OK)
        finish()
    }
}

private const val TAG = "ManaraProvision"
