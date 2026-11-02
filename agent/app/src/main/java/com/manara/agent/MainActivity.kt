package com.manara.agent

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.manara.agent.enforcers.TimeLimitEnforcer
import com.manara.agent.policy.Policy

/**
 * One screen. It reports whether Manara is currently the device owner — the one
 * fact Phase 0 exists to confirm — and (re)starts the visible managed notice.
 *
 * No layout XML on purpose: keeps the Phase 0 app to the fewest files possible.
 */
class MainActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val owner = ComponentName(this, OwnerReceiver::class.java)

        val isDeviceOwner = dpm.isDeviceOwnerApp(packageName)
        val isAdminActive = dpm.isAdminActive(owner)

        // If we're managing this device, make sure the honest notice is showing.
        if (isDeviceOwner) {
            ManagedNoticeService.start(this)
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        root.addView(TextView(this).apply {
            text = "Manara — Phase 0"
            textSize = 22f
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
        })

        root.addView(TextView(this).apply {
            text = if (isDeviceOwner) "Device owner: YES" else "Device owner: NO"
            textSize = 20f
            setTextColor(if (isDeviceOwner) Color.rgb(0, 128, 0) else Color.RED)
            gravity = Gravity.CENTER
            setPadding(0, 48, 0, 0)
        })

        root.addView(TextView(this).apply {
            text = "Device admin active: ${if (isAdminActive) "yes" else "no"}"
            textSize = 15f
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 0)
        })

        if (!isDeviceOwner) {
            root.addView(TextView(this).apply {
                text = "\nTo set via ADB on a factory-reset phone:\n" +
                        "adb shell dpm set-device-owner \n" +
                        "com.manara.agent/.OwnerReceiver"
                textSize = 13f
                gravity = Gravity.CENTER
                setPadding(0, 32, 0, 0)
            })
        }

        if (isDeviceOwner) {
            addTimeLimitTestHarness(root)
        }

        setContentView(root)
    }

    /**
     * Temporary on-device verification harness for docs/phase1-plan.md step
     * 3 — confirms TimeLimitEnforcer's setPackagesSuspended call actually
     * blocks a real app, not just that the decision logic is right (that
     * part is already covered by TimeLimitDecisionTest). Not meant to
     * survive once that's verified and a real policy-editing UI exists.
     */
    private fun addTimeLimitTestHarness(root: LinearLayout) {
        val testPackage = "com.instagram.android"
        val enforcer = TimeLimitEnforcer(this)

        root.addView(TextView(this).apply {
            text = "\n— TimeLimitEnforcer test (step 3) —\nTarget: $testPackage"
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(0, 32, 0, 8)
        })

        root.addView(Button(this).apply {
            text = "Open Usage Access settings"
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
            }
        })

        root.addView(Button(this).apply {
            text = "Suspend $testPackage now (limit = 0)"
            setOnClickListener {
                enforcer.apply(
                    Policy(
                        version = 1,
                        timeLimits = Policy.TimeLimits(
                            enabled = true,
                            rules = listOf(
                                Policy.TimeLimits.Rule(
                                    category = "test",
                                    packages = listOf(testPackage),
                                    dailyMinutes = 0
                                )
                            )
                        )
                    )
                )
                Toast.makeText(this@MainActivity, "Applied — check if $testPackage is now blocked", Toast.LENGTH_LONG).show()
            }
        })

        root.addView(Button(this).apply {
            text = "Resume $testPackage (disable the rule)"
            setOnClickListener {
                enforcer.apply(Policy(version = 2, timeLimits = Policy.TimeLimits(enabled = false)))
                Toast.makeText(this@MainActivity, "Applied — check if $testPackage opens again", Toast.LENGTH_LONG).show()
            }
        })

        root.addView(Button(this).apply {
            text = "Force-unsuspend $testPackage (bypass tracking)"
            setOnClickListener {
                val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                val admin = ComponentName(this@MainActivity, OwnerReceiver::class.java)
                runCatching { dpm.setPackagesSuspended(admin, arrayOf(testPackage), false) }
                Toast.makeText(this@MainActivity, "Directly unsuspended $testPackage", Toast.LENGTH_LONG).show()
            }
        })
    }
}
