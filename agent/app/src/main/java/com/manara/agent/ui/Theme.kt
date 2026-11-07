package com.manara.agent.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// The console's palette: deep teal, with the lamp's amber as the accent.
private val Teal = Color(0xFF0F4C5C)
private val TealLight = Color(0xFF5CB3C4)
private val Lamp = Color(0xFFF2A93B)

private val Light = lightColorScheme(
    primary = Teal,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE3F0F2),
    onPrimaryContainer = Color(0xFF062229),
    secondary = Color(0xFF8A5A00),
    secondaryContainer = Color(0xFFFDF1DC),
    onSecondaryContainer = Color(0xFF5C3B00),
    tertiary = Lamp,
    background = Color(0xFFF4F6F8),
    onBackground = Color(0xFF12202A),
    surface = Color.White,
    onSurface = Color(0xFF12202A),
    surfaceVariant = Color(0xFFF8FAFB),
    onSurfaceVariant = Color(0xFF5A6A76),
    outline = Color(0xFFE1E6EA),
    error = Color(0xFFB42318),
    errorContainer = Color(0xFFFDECEA),
    onErrorContainer = Color(0xFF7A1A12),
)

private val Dark = darkColorScheme(
    primary = TealLight,
    onPrimary = Color(0xFF062229),
    primaryContainer = Color(0xFF16323A),
    onPrimaryContainer = Color(0xFFD6EEF2),
    secondary = Color(0xFFF2B65A),
    secondaryContainer = Color(0xFF33270F),
    onSecondaryContainer = Color(0xFFFBE3BC),
    tertiary = Lamp,
    background = Color(0xFF0D1418),
    onBackground = Color(0xFFE6EDF1),
    surface = Color(0xFF141D23),
    onSurface = Color(0xFFE6EDF1),
    surfaceVariant = Color(0xFF18232A),
    onSurfaceVariant = Color(0xFF93A3AD),
    outline = Color(0xFF25323B),
    error = Color(0xFFFF8A7F),
    errorContainer = Color(0xFF3A1A18),
    onErrorContainer = Color(0xFFFFDAD5),
)

private val Type = Typography().run {
    copy(
        headlineSmall = headlineSmall.copy(fontWeight = FontWeight.SemiBold),
        titleMedium = titleMedium.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = labelLarge.copy(fontWeight = FontWeight.SemiBold),
        bodyMedium = TextStyle(fontSize = 15.sp, lineHeight = 22.sp),
    )
}

@Composable
fun ManaraTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, typography = Type, content = content)
}
