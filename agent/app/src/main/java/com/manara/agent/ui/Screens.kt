package com.manara.agent.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

// ---- Building blocks ---------------------------------------------------------

/** The lighthouse, drawn so it follows the theme. */
@Composable
fun Logo(size: Int = 44) {
    val brand = MaterialTheme.colorScheme.primary
    val onBrand = MaterialTheme.colorScheme.onPrimary
    val lamp = MaterialTheme.colorScheme.tertiary
    Canvas(Modifier.size(size.dp)) {
        val u = this.size.width / 32f
        drawRoundRect(brand, size = this.size, cornerRadius = androidx.compose.ui.geometry.CornerRadius(8 * u))
        drawPath(Path().apply { moveTo(13 * u, 13 * u); lineTo(19 * u, 13 * u); lineTo(20.6f * u, 27 * u); lineTo(11.4f * u, 27 * u); close() }, onBrand)
        drawRect(lamp, topLeft = Offset(12.5f * u, 9.5f * u), size = Size(7 * u, 3.5f * u))
        drawPath(Path().apply { moveTo(16 * u, 5 * u); lineTo(20 * u, 9.5f * u); lineTo(12 * u, 9.5f * u); close() }, onBrand)
    }
}

@Composable
private fun Page(content: @Composable () -> Unit) {
    Scaffold { padding ->
        Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.widthIn(max = 560.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) { content() }
        }
    }
}

@Composable
private fun Header(title: String, subtitle: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Logo()
        Spacer(Modifier.size(14.dp))
        Column {
            Text(title, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            content()
        }
    }
}

@Composable
private fun LineItem(title: String, detail: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, style = MaterialTheme.typography.bodyLarge)
        Text(detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Note(text: String, warning: Boolean = false) {
    val colors = MaterialTheme.colorScheme
    Card(
        colors = CardDefaults.cardColors(containerColor = if (warning) colors.secondaryContainer else colors.primaryContainer),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(text, Modifier.padding(14.dp), color = if (warning) colors.onSecondaryContainer else colors.onPrimaryContainer)
    }
}

@Composable
private fun Busy() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
        Spacer(Modifier.size(10.dp))
        Text("Please wait…")
    }
}

// ---- Connect -----------------------------------------------------------------

/** First screen of a new phone, and the screen a parent's move opens. */
@Composable
fun ConnectScreen(moving: Boolean, busy: Boolean, message: String?, onScan: () -> Unit, onCode: (String) -> Unit, onPrivacy: () -> Unit) {
    var code by remember { mutableStateOf("") }
    Page {
        Header(
            if (moving) "Connect to the new account" else "Welcome to Manara",
            if (moving) "Your parent is moving this phone to another account." else "Parental controls your child can always see.",
        )
        Section(if (moving) "Scan the new account's code" else "Connect this phone") {
            Text(
                if (moving) "In the new parent account, choose Add a phone and say Manara is already set up. Then scan the code it shows."
                else "On the parent's phone or computer, open the Manara console and choose Add a phone. Then scan the code it shows.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(onClick = onScan, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Scan the code") }
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            OutlinedTextField(
                value = code,
                onValueChange = { code = it.trim() },
                label = { Text("Or type the code") },
                singleLine = true,
                enabled = !busy,
                // A one-time secret: a password-type field, so the keyboard neither suggests nor learns it
                // (MASVS-STORAGE-2, keyboard cache).
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedButton(onClick = { onCode(code) }, enabled = !busy && code.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("Connect") }
            if (busy) Busy()
            if (message != null) Note(message, warning = true)
        }
        if (!moving) {
            Text(
                "Manara is only for a parent managing their own child's phone. The phone always shows that it is managed and " +
                    "what is shared.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        TextButton(onClick = onPrivacy, contentPadding = PaddingValues(0.dp)) { Text("Privacy policy") }
    }
}

// ---- Guided setup ------------------------------------------------------------

@Composable
fun SetupScreen(supported: Boolean, running: Boolean, onStart: () -> Unit, onOpenDeveloperOptions: () -> Unit) {
    Page {
        Header("Almost there", "This phone is connected to a parent account.")
        if (!supported) {
            Note("Guided setup needs Android 11 or newer. This phone can't be set up by itself.", warning = true)
            return@Page
        }
        Section("Let Manara manage this phone") {
            Step(1, "Open Settings, then Developer options, and turn on Wireless debugging. The parent's console shows how for this phone.")
            Step(2, "Tap Start guided setup below, and allow notifications.")
            Step(3, "In Wireless debugging, tap Pair device with QR code and scan the code in the parent's console. Or tap Pair device with pairing code and type its code in the console.")
            Step(4, "Keep the phone on that screen. Everything else is done in the console, which shows each step.")
            if (running) {
                Note("Setup is running. Pair from the parent's console.")
                OutlinedButton(onClick = onOpenDeveloperOptions, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Open Developer options") }
            } else {
                Button(onClick = onStart, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Start guided setup") }
            }
        }
    }
}

@Composable
private fun Step(number: Int, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(
            Modifier.size(26.dp),
            contentAlignment = Alignment.Center,
        ) {
            val primary = MaterialTheme.colorScheme.primary
            Canvas(Modifier.fillMaxSize()) { drawCircle(primary) }
            Text("$number", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelLarge)
        }
        Spacer(Modifier.size(12.dp))
        Text(text, Modifier.padding(top = 2.dp))
    }
}

// ---- Managed -----------------------------------------------------------------

@Composable
fun ManagedScreen(view: ChildView.View, refreshing: Boolean, onFix: (ChildView.Fix) -> Unit, onRefresh: () -> Unit, onRelease: () -> Unit, onPrivacy: () -> Unit) {
    Page {
        Header("This phone is managed", "By your parent, with Manara.")

        if (view.attention.isNotEmpty()) {
            Section("Needs attention") {
                view.attention.forEach { item ->
                    Text(item.text)
                    OutlinedButton(onClick = { onFix(item.fix) }) { Text(if (item.fix == ChildView.Fix.USAGE_ACCESS) "Open usage access" else "Open location settings") }
                }
            }
        }

        Section("What your parent can see") {
            view.seen.forEach { LineItem(it.title, it.detail) }
            Text(
                view.neverShared,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }

        Section("Rules on this phone") {
            if (view.rules.isEmpty()) Text("No rules yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            view.rules.forEach { LineItem(it.title, it.detail) }
        }

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(view.lastContact, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            if (refreshing) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            else TextButton(onClick = onRefresh) { Text("Check now") }
        }
        Row {
            TextButton(onClick = onRelease, contentPadding = PaddingValues(0.dp)) { Text("Release this phone") }
            Spacer(Modifier.size(20.dp))
            TextButton(onClick = onPrivacy, contentPadding = PaddingValues(0.dp)) { Text("Privacy policy") }
        }
    }
}

// ---- Release -----------------------------------------------------------------

sealed class ReleaseStep {
    data object EnterCode : ReleaseStep()
    data object Choose : ReleaseStep()
    data object Working : ReleaseStep()
}

@Composable
fun ReleaseScreen(step: ReleaseStep, message: String?, onCode: (String) -> Unit, onRemove: () -> Unit, onMove: () -> Unit, onBack: () -> Unit) {
    var code by remember { mutableStateOf("") }
    var confirmRemove by remember { mutableStateOf(false) }
    Page {
        Header("Release this phone", "Only your parent can do this.")
        when (step) {
            ReleaseStep.EnterCode -> Section("Your parent's release code") {
                Text(
                    "Your parent finds it in the Manara console: open this phone, then Phone, then Show release code. It works without a connection.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(
                    value = code,
                    onValueChange = { typed -> code = typed.filter { it.isDigit() }.take(8) },
                    label = { Text("8-digit code") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (message != null) Note(message, warning = true)
                Button(onClick = { onCode(code) }, enabled = code.length == 8, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Continue") }
                TextButton(onClick = onBack) { Text("Back") }
            }
            ReleaseStep.Choose -> Section("What should happen?") {
                Button(onClick = onMove, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Move to another parent account") }
                Text("Keeps everything set up. For the next 30 minutes the phone accepts the new account's code.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = { confirmRemove = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Remove Manara from this phone") }
                Text("Lifts every rule and stops managing the phone. Manara can then be uninstalled.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = onBack) { Text("Cancel") }
            }
            ReleaseStep.Working -> Busy()
        }
    }
    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text("Remove Manara?") },
            text = { Text("Every rule is lifted and Manara stops managing this phone. Setting it up again means the full guided setup.") },
            confirmButton = { TextButton(onClick = { confirmRemove = false; onRemove() }) { Text("Remove", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text("Cancel") } },
        )
    }
}

@Composable
fun ReleasedScreen() {
    Page {
        Header("Manara is off", "This phone is no longer managed.")
        Section("All done") {
            Text("Every rule has been lifted. You can uninstall Manara from Settings, Apps.")
        }
        Text(
            "Thanks for using Manara.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
