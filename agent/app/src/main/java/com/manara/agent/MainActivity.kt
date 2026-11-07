package com.manara.agent

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.manara.agent.enforcers.defaultEnforcerRegistry
import com.manara.agent.enroll.EnrollmentRepository
import com.manara.agent.enroll.PreviousAccountData
import com.manara.agent.policy.CollectionStatusReader
import com.manara.agent.policy.PolicyCache
import com.manara.agent.push.PushManager
import com.manara.agent.release.ReleaseStore
import com.manara.agent.release.Releaser
import com.manara.agent.release.TransferWindow
import com.manara.agent.setup.SetupService
import com.manara.agent.storage.ManaraDatabase
import com.manara.agent.sync.DeviceTokenStore
import com.manara.agent.sync.ManaraApiFactory
import com.manara.agent.sync.SyncManager
import com.manara.agent.sync.SyncStatusStore
import com.manara.agent.sync.SyncWorker
import com.manara.agent.ui.ChildView
import com.manara.agent.ui.ConnectScreen
import com.manara.agent.ui.HomeModel
import com.manara.agent.ui.ManagedScreen
import com.manara.agent.ui.ManaraTheme
import com.manara.agent.ui.ReleaseScreen
import com.manara.agent.ui.ReleaseStep
import com.manara.agent.ui.ReleasedScreen
import com.manara.agent.ui.SetupScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Date

/**
 * The app's one activity. Which screen shows is [HomeModel]'s decision and what
 * the managed screen says is [ChildView]'s; this class only does the Android side.
 */
class MainActivity : ComponentActivity() {
    /** Bumped on every resume, so the screens re-read the phone's state. */
    private val resumes = mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { ManaraTheme { App() } }
    }

    override fun onResume() {
        super.onResume()
        keepManagementRunning()
        resumes.intValue++
    }

    private val isDeviceOwner: Boolean
        get() = getSystemService(DevicePolicyManager::class.java).isDeviceOwnerApp(packageName)

    /** Idempotent: the notice, syncing, and self-granted permissions of a managed phone. */
    private fun keepManagementRunning() {
        if (!isDeviceOwner) return
        ManagedNoticeService.start(this)
        OwnerReceiver.grantSelfGrantablePermissions(this)
        if (DeviceTokenStore(this).deviceToken() != null) {
            SyncWorker.schedule(this)
            PushManager.ensureRegistered(this)
        }
    }

    private enum class Route { HOME, RELEASE, RELEASED }

    @Composable
    private fun App() {
        val resume by resumes
        var route by remember { mutableStateOf(Route.HOME) }

        val tokenStore = remember { DeviceTokenStore(this) }
        val releaseStore = remember { ReleaseStore(this) }
        val enrolled = remember(resume, route) { tokenStore.deviceId() != null }
        val deviceOwner = remember(resume, route) { isDeviceOwner }
        val moveOpen = remember(resume, route) { TransferWindow.isOpen(releaseStore.transferUntil, System.currentTimeMillis()) }

        when (route) {
            Route.RELEASED -> ReleasedScreen()
            Route.RELEASE -> {
                BackHandler { route = Route.HOME }
                ReleaseFlow(onDone = { released -> route = if (released) Route.RELEASED else Route.HOME })
            }
            Route.HOME -> {
                val screen = HomeModel.screen(enrolled, deviceOwner)
                when {
                    screen == HomeModel.Screen.MANAGED && moveOpen -> Connect(moving = true) { resumes.intValue++ }
                    screen == HomeModel.Screen.CONNECT -> Connect(moving = false) { resumes.intValue++ }
                    screen == HomeModel.Screen.SETUP -> Setup { resumes.intValue++ }
                    else -> Managed(resume, onReleased = { route = Route.RELEASED }, onRelease = { route = Route.RELEASE })
                }
            }
        }
    }

    @Composable
    private fun Connect(moving: Boolean, onConnected: () -> Unit) {
        val scope = rememberCoroutineScope()
        var busy by remember { mutableStateOf(false) }
        var message by remember { mutableStateOf<String?>(null) }

        fun enroll(code: String) {
            busy = true
            message = null
            scope.launch {
                val db = ManaraDatabase.get(this@MainActivity)
                val repository = EnrollmentRepository(
                    api = ManaraApiFactory.create(),
                    tokenStore = DeviceTokenStore(this@MainActivity),
                    policyCache = PolicyCache(db),
                    enforcerRegistry = defaultEnforcerRegistry(this@MainActivity),
                    previousAccountData = PreviousAccountData(db),
                    releaseStore = ReleaseStore(this@MainActivity),
                )
                val result = withContext(Dispatchers.IO) { repository.enroll(code) }
                busy = false
                when (result) {
                    is EnrollmentRepository.Result.Success -> {
                        keepManagementRunning()
                        onConnected()
                    }
                    is EnrollmentRepository.Result.Rejected -> message =
                        "That code didn't work. Codes work once: ask for a new one in the console."
                    is EnrollmentRepository.Result.NotAllowed -> message =
                        "This phone is managed for a parent account. Only that parent can release it."
                    is EnrollmentRepository.Result.Failed -> message =
                        "Couldn't reach Manara. Check the internet connection and try again; the server can take a minute to wake up."
                }
            }
        }

        ConnectScreen(
            moving = moving,
            busy = busy,
            message = message,
            onScan = {
                GmsBarcodeScanning.getClient(this).startScan()
                    .addOnSuccessListener { barcode -> barcode.rawValue?.let(::enroll) ?: run { message = "That QR code had nothing to read." } }
                    .addOnFailureListener { message = "The scanner couldn't start. Type the code instead." }
            },
            onCode = ::enroll,
        )
    }

    @Composable
    private fun Setup(onManaged: () -> Unit) {
        var running by remember { mutableStateOf(SetupService.isRunning) }
        val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
            // The pairing code is typed into a notification, so setup only starts once it can show one.
            if (it) SetupService.start(this)
        }
        LaunchedEffect(Unit) {
            while (true) {
                running = SetupService.isRunning
                if (isDeviceOwner && !running) {
                    keepManagementRunning()
                    onManaged()
                    break
                }
                delay(2_000)
            }
        }
        SetupScreen(
            supported = HomeModel.setupSupported(Build.VERSION.SDK_INT),
            running = running,
            onStart = {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                else SetupService.start(this)
            },
        )
    }

    @Composable
    private fun Managed(resume: Int, onReleased: () -> Unit, onRelease: () -> Unit) {
        val scope = rememberCoroutineScope()
        var view by remember { mutableStateOf<ChildView.View?>(null) }
        var refreshing by remember { mutableStateOf(false) }
        var reloads by remember { mutableIntStateOf(0) }

        LaunchedEffect(resume, reloads) {
            view = withContext(Dispatchers.IO) {
                val db = ManaraDatabase.get(this@MainActivity)
                val policy = PolicyCache(db).current()
                val snapshot = CollectionStatusReader(this@MainActivity, db).read(policy)
                ChildView.build(policy, snapshot.usage, snapshot.location, SyncStatusStore(this@MainActivity).lastSuccessAt(), System.currentTimeMillis())
            }
        }

        val current = view ?: return
        ManagedScreen(
            view = current,
            refreshing = refreshing,
            onFix = { fix ->
                startActivity(Intent(if (fix == ChildView.Fix.USAGE_ACCESS) Settings.ACTION_USAGE_ACCESS_SETTINGS else Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            },
            onRefresh = {
                refreshing = true
                scope.launch {
                    val registry = defaultEnforcerRegistry(this@MainActivity)
                    val result = withContext(Dispatchers.IO) {
                        val result = SyncManager.create(this@MainActivity, registry).sync()
                        if (result !is SyncManager.Result.Released) {
                            val db = ManaraDatabase.get(this@MainActivity)
                            PolicyCache(db).current()?.let { registry.applyAll(it) }
                            com.manara.agent.events.EventQueue(db).let { queue -> registry.collectAllEvents().forEach { queue.enqueue(it) } }
                        }
                        result
                    }
                    refreshing = false
                    if (result is SyncManager.Result.Released) onReleased() else reloads++
                }
            },
            onRelease = onRelease,
        )
    }

    @Composable
    private fun ReleaseFlow(onDone: (released: Boolean) -> Unit) {
        val scope = rememberCoroutineScope()
        var step by remember { mutableStateOf<ReleaseStep>(ReleaseStep.EnterCode) }
        var message by remember { mutableStateOf<String?>(null) }
        val releaser = remember {
            val db = ManaraDatabase.get(this)
            Releaser(this, db, defaultEnforcerRegistry(this), DeviceTokenStore(this), ReleaseStore(this))
        }

        ReleaseScreen(
            step = step,
            message = message,
            onCode = { code ->
                message = when (val result = releaser.checkCode(code)) {
                    is Releaser.CodeResult.Accepted -> { step = ReleaseStep.Choose; null }
                    is Releaser.CodeResult.Wrong -> "That code isn't right. Check it with your parent."
                    is Releaser.CodeResult.Locked ->
                        "Too many wrong codes. Try again after ${DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(result.untilMillis))}."
                    is Releaser.CodeResult.NoSecret ->
                        "This phone hasn't received its release key yet. Connect to the internet, wait a few minutes, and try again."
                }
            },
            onMove = {
                releaser.openTransfer(commandId = null)
                onDone(false)
            },
            onRemove = {
                step = ReleaseStep.Working
                scope.launch {
                    withContext(Dispatchers.IO) { releaser.removeManara() }
                    onDone(true)
                }
            },
            onBack = { onDone(false) },
        )
    }
}
