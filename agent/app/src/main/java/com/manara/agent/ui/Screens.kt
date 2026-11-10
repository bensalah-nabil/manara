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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.manara.agent.R

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
        Text(stringResource(R.string.please_wait))
    }
}

// ---- Connect -----------------------------------------------------------------

/** First screen of a new phone, and the screen a parent's move opens. */
@Composable
fun ConnectScreen(moving: Boolean, busy: Boolean, message: String?, onScan: () -> Unit, onCode: (String) -> Unit, onPrivacy: () -> Unit) {
    var code by remember { mutableStateOf("") }
    Page {
        Header(
            stringResource(if (moving) R.string.connect_title_move else R.string.connect_title_new),
            stringResource(if (moving) R.string.connect_subtitle_move else R.string.connect_subtitle_new),
        )
        Section(stringResource(if (moving) R.string.connect_section_move else R.string.connect_section_new)) {
            Text(
                stringResource(if (moving) R.string.connect_help_move else R.string.connect_help_new),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(onClick = onScan, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(stringResource(R.string.connect_scan)) }
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            OutlinedTextField(
                value = code,
                onValueChange = { code = it.trim() },
                label = { Text(stringResource(R.string.connect_type_code)) },
                singleLine = true,
                enabled = !busy,
                // A one-time secret: a password-type field, so the keyboard neither suggests nor learns it
                // (MASVS-STORAGE-2, keyboard cache).
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedButton(onClick = { onCode(code) }, enabled = !busy && code.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.connect_button)) }
            if (busy) Busy()
            if (message != null) Note(message, warning = true)
        }
        if (!moving) {
            Text(
                stringResource(R.string.connect_only_for),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        TextButton(onClick = onPrivacy, contentPadding = PaddingValues(0.dp)) { Text(stringResource(R.string.privacy_policy)) }
    }
}

// ---- Guided setup ------------------------------------------------------------

@Composable
fun SetupScreen(supported: Boolean, running: Boolean, onStart: () -> Unit, onOpenDeveloperOptions: () -> Unit) {
    Page {
        Header(stringResource(R.string.setup_title), stringResource(R.string.setup_subtitle))
        if (!supported) {
            Note(stringResource(R.string.setup_unsupported), warning = true)
            return@Page
        }
        Section(stringResource(R.string.setup_section)) {
            Step(1, stringResource(R.string.setup_step_1))
            Step(2, stringResource(R.string.setup_step_2))
            Step(3, stringResource(R.string.setup_step_3))
            Step(4, stringResource(R.string.setup_step_4))
            if (running) {
                Note(stringResource(R.string.setup_running))
                OutlinedButton(onClick = onOpenDeveloperOptions, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(stringResource(R.string.setup_open_developer_options)) }
            } else {
                Button(onClick = onStart, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(stringResource(R.string.setup_start)) }
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
        Header(stringResource(R.string.managed_title), stringResource(R.string.managed_subtitle))

        if (view.attention.isNotEmpty()) {
            Section(stringResource(R.string.attention_title)) {
                view.attention.forEach { item ->
                    Text(item.text)
                    OutlinedButton(onClick = { onFix(item.fix) }) { Text(stringResource(if (item.fix == ChildView.Fix.USAGE_ACCESS) R.string.fix_usage_access else R.string.fix_location)) }
                }
            }
        }

        Section(stringResource(R.string.seen_title)) {
            view.seen.forEach { LineItem(it.title, it.detail) }
            Text(
                view.neverShared,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }

        Section(stringResource(R.string.rules_title)) {
            if (view.rules.isEmpty()) Text(stringResource(R.string.no_rules), color = MaterialTheme.colorScheme.onSurfaceVariant)
            view.rules.forEach { LineItem(it.title, it.detail) }
        }

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(view.lastContact, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            if (refreshing) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            else TextButton(onClick = onRefresh) { Text(stringResource(R.string.check_now)) }
        }
        Row {
            TextButton(onClick = onRelease, contentPadding = PaddingValues(0.dp)) { Text(stringResource(R.string.release_this_phone)) }
            Spacer(Modifier.size(20.dp))
            TextButton(onClick = onPrivacy, contentPadding = PaddingValues(0.dp)) { Text(stringResource(R.string.privacy_policy)) }
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
        Header(stringResource(R.string.release_title), stringResource(R.string.release_subtitle))
        when (step) {
            ReleaseStep.EnterCode -> Section(stringResource(R.string.release_code_section)) {
                Text(
                    stringResource(R.string.release_code_help),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedTextField(
                    value = code,
                    onValueChange = { typed -> code = typed.filter { it.isDigit() }.take(8) },
                    label = { Text(stringResource(R.string.release_code_label)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (message != null) Note(message, warning = true)
                Button(onClick = { onCode(code) }, enabled = code.length == 8, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(stringResource(R.string.action_continue)) }
                TextButton(onClick = onBack) { Text(stringResource(R.string.action_back)) }
            }
            ReleaseStep.Choose -> Section(stringResource(R.string.release_choose_title)) {
                Button(onClick = onMove, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(stringResource(R.string.release_move)) }
                Text(stringResource(R.string.release_move_help), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(onClick = { confirmRemove = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text(stringResource(R.string.release_remove)) }
                Text(stringResource(R.string.release_remove_help), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = onBack) { Text(stringResource(R.string.action_cancel)) }
            }
            ReleaseStep.Working -> Busy()
        }
    }
    if (confirmRemove) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text(stringResource(R.string.remove_confirm_title)) },
            text = { Text(stringResource(R.string.remove_confirm_text)) },
            confirmButton = { TextButton(onClick = { confirmRemove = false; onRemove() }) { Text(stringResource(R.string.action_remove), color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
}

@Composable
fun ReleasedScreen() {
    Page {
        Header(stringResource(R.string.released_title), stringResource(R.string.released_subtitle))
        Section(stringResource(R.string.released_section)) {
            Text(stringResource(R.string.released_text))
        }
        Text(
            stringResource(R.string.released_thanks),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
