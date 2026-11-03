package com.manara.agent

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.manara.agent.enforcers.TimeLimitEnforcer
import com.manara.agent.enforcers.defaultEnforcerRegistry
import com.manara.agent.enroll.EnrollmentActivity
import com.manara.agent.events.EventQueue
import com.manara.agent.policy.Policy
import com.manara.agent.policy.PolicyCache
import com.manara.agent.storage.ManaraDatabase
import com.manara.agent.sync.DeviceTokenStore
import com.manara.agent.sync.ManaraApiFactory
import com.manara.agent.sync.SyncManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
            // Belt-and-suspenders alongside OwnerReceiver.onEnabled() and
            // BootReceiver -- idempotent (KEEP policy / re-granting an
            // already-granted permission is a no-op), and the only way this
            // phone's already-enrolled admin (from before these existed)
            // actually gets them without a fresh enrollment.
            com.manara.agent.sync.SyncWorker.schedule(this)
            OwnerReceiver.grantSelfGrantablePermissions(this)
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            // WRAP_CONTENT on height, not MATCH_PARENT -- this is now the
            // direct child of a ScrollView (added test harnesses pushed the
            // content past one screen's height), and MATCH_PARENT here
            // would force it to the screen's height and defeat scrolling.
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
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
            addSyncTestHarness(root)
        }

        setContentView(ScrollView(this).apply { addView(root) })
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
            text = "Show tracked usage today ($testPackage)"
            setOnClickListener {
                val minutes = enforcer.todaysUsageMinutesByPackage()[testPackage]
                val message = if (minutes == null) {
                    "No entry for $testPackage -- either Usage Access isn't really " +
                        "granted (check appops, not just Settings), or it hasn't been " +
                        "opened today at all"
                } else {
                    "$testPackage: $minutes minute(s) tracked today"
                }
                Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
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

    /**
     * Phase 1 step 7's sync test, now pointed at the real enrollment screen
     * (step 6) instead of an inline "Enroll" button that duplicated
     * [EnrollmentRepository]'s logic. "Sync now" stays as a manual trigger
     * alongside the periodic `SyncWorker` — useful for testing without
     * waiting out the schedule.
     */
    private fun addSyncTestHarness(root: LinearLayout) {
        val scope = CoroutineScope(Dispatchers.Main)
        val tokenStore = DeviceTokenStore(this)
        val db = ManaraDatabase.get(this)
        val policyCache = PolicyCache(db)
        val eventQueue = EventQueue(db)
        val registry = defaultEnforcerRegistry(this)

        val status = TextView(this).apply {
            text = "\n— Sync test (steps 5-7) —\nNot enrolled"
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(0, 32, 0, 8)
        }
        root.addView(status)

        fun refreshStatus(message: String) {
            status.text = "\n— Sync test (steps 5-7) —\n$message"
        }

        root.addView(Button(this).apply {
            text = "Enroll this device"
            setOnClickListener {
                startActivity(Intent(this@MainActivity, EnrollmentActivity::class.java))
            }
        })

        root.addView(Button(this).apply {
            text = "Sync now"
            setOnClickListener {
                scope.launch {
                    val syncManager = SyncManager(
                        api = ManaraApiFactory.create(),
                        policyCache = policyCache,
                        eventQueue = eventQueue,
                        enforcerRegistry = registry,
                        tokenStore = tokenStore
                    )
                    val syncResult = withContext(Dispatchers.IO) { syncManager.sync() }
                    // Same fix as SyncWorker: re-apply the cached policy
                    // regardless of whether this sync changed it, since a
                    // lock schedule / usage limit is wall-clock-driven, not
                    // just policy-change-driven. Without this, a second
                    // "Sync now" tap on an unchanged policy looks like
                    // enforcement silently stopped working.
                    withContext(Dispatchers.IO) { policyCache.current()?.let { registry.applyAll(it) } }
                    val message = when (syncResult) {
                        is SyncManager.Result.Success -> {
                            val version = withContext(Dispatchers.IO) { policyCache.currentVersion() }
                            "Sync OK, policy version: $version"
                        }
                        is SyncManager.Result.NotEnrolled -> "Not enrolled — tap Enroll first"
                        is SyncManager.Result.Unauthorized -> "Unauthorized — token rejected"
                        is SyncManager.Result.Failed -> "Sync failed: ${syncResult.cause.message}"
                    }
                    refreshStatus(message)
                }
            }
        })

        root.addView(Button(this).apply {
            text = "Run SyncWorker via WorkManager (not a direct call)"
            setOnClickListener {
                // Unlike the button above (which calls SyncManager directly
                // from this Activity's own scope), this actually goes
                // through WorkManager -- the same dispatch path the real
                // periodic job uses, just as a one-time request instead of
                // waiting ~15 min. Added because `adb shell cmd jobscheduler
                // run -f` turned out NOT to reliably invoke doWork() for a
                // WorkManager-backed job when tested -- this is the cleaner
                // way to actually exercise that code path on demand.
                val request = androidx.work.OneTimeWorkRequestBuilder<com.manara.agent.sync.SyncWorker>().build()
                androidx.work.WorkManager.getInstance(this@MainActivity).enqueue(request)
                refreshStatus("Enqueued one-time SyncWorker run (id=${request.id}) -- check logcat/adb for the result")
            }
        })
    }
}
