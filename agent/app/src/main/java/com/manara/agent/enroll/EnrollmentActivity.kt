package com.manara.agent.enroll

import android.app.Activity
import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.manara.agent.enforcers.defaultEnforcerRegistry
import com.manara.agent.policy.PolicyCache
import com.manara.agent.storage.ManaraDatabase
import com.manara.agent.sync.DeviceTokenStore
import com.manara.agent.sync.ManaraApiFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The real enrollment screen (`docs/phase1-plan.md` step 6) — manual token
 * entry plus QR scanning, replacing the ad-hoc "Enroll" button that lived
 * directly in `MainActivity`'s test harness.
 *
 * QR payload is the plain enrollment token as text, not a JSON blob with a
 * server host: the server is fixed per build (`ManaraApiFactory.BASE_URL`,
 * from MANARA_API_URL in local.properties).
 */
class EnrollmentActivity : Activity() {

    private lateinit var tokenField: EditText
    private lateinit var status: TextView
    private val scope = CoroutineScope(Dispatchers.Main)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        }

        root.addView(TextView(this).apply {
            text = "Enroll this device"
            textSize = 22f
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
        })

        root.addView(Button(this).apply {
            text = "Scan QR code"
            setPadding(0, 32, 0, 0)
            setOnClickListener { scanQrCode() }
        })

        root.addView(TextView(this).apply {
            text = "\nor enter the token manually:"
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 8)
        })

        tokenField = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT
            hint = "Enrollment token"
        }
        root.addView(tokenField)

        root.addView(Button(this).apply {
            text = "Enroll"
            setPadding(0, 16, 0, 0)
            setOnClickListener { enroll(tokenField.text.toString()) }
        })

        status = TextView(this).apply {
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, 32, 0, 0)
        }
        root.addView(status)

        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun scanQrCode() {
        GmsBarcodeScanning.getClient(this).startScan()
            .addOnSuccessListener { barcode ->
                val value = barcode.rawValue
                if (value != null) {
                    tokenField.setText(value)
                    enroll(value)
                } else {
                    status.text = "Scanned code had no readable value"
                }
            }
            .addOnFailureListener { e ->
                status.text = "Scan failed: ${e.message}"
            }
            .addOnCanceledListener {
                status.text = "Scan cancelled"
            }
    }

    private fun enroll(token: String) {
        status.text = "Enrolling…"
        scope.launch {
            val db = ManaraDatabase.get(this@EnrollmentActivity)
            val repository = EnrollmentRepository(
                api = ManaraApiFactory.create(),
                tokenStore = DeviceTokenStore(this@EnrollmentActivity),
                policyCache = PolicyCache(db),
                enforcerRegistry = defaultEnforcerRegistry(this@EnrollmentActivity)
            )
            val result = withContext(Dispatchers.IO) { repository.enroll(token) }
            status.text = when (result) {
                is EnrollmentRepository.Result.Success -> "Enrolled successfully."
                is EnrollmentRepository.Result.Rejected ->
                    "Enrollment rejected (HTTP ${result.httpCode}) — check the token."
                is EnrollmentRepository.Result.Failed ->
                    "Enrollment failed: ${result.cause.message}"
            }
        }
    }
}
