#!/usr/bin/env bash
# Pre-flight check for ADR-0003's account-removal enrollment (no factory
# reset). Read-only: lists exactly what blocks `dpm set-device-owner` on a
# real phone, so removal is driven by this device's actual state instead of
# guesswork. Never touches credentials -- account removal only unlinks the
# device from an account already backed up in its own cloud (Google/Samsung
# Password Manager, etc.); nothing here extracts or stores a password.
#
# Usage: scripts/enroll-preflight.sh <serial>
#   ADB=/path/to/adb.exe scripts/enroll-preflight.sh <serial>   # override adb path

set -euo pipefail

SERIAL="${1:?usage: enroll-preflight.sh <serial>   (run \`adb devices\` to list)}"
ADB="${ADB:-C:/Users/nbensalah/AppData/Local/Android/Sdk/platform-tools/adb.exe}"

adbs() { "$ADB" -s "$SERIAL" "$@"; }

ready=true

echo "== Device =="
model="$(adbs shell getprop ro.product.model | tr -d '\r')"
android="$(adbs shell getprop ro.build.version.release | tr -d '\r')"
echo "model:   $model"
echo "android: $android"
echo "serial:  $SERIAL"

echo
echo "== 1. Accounts (must be zero) =="
account_lines="$(adbs shell dumpsys account | tr -d '\r')"
accounts="$(printf '%s\n' "$account_lines" | grep -E '^\s*Account \{' || true)"
count="$(printf '%s\n' "$accounts" | grep -c . || true)"
if [ -z "$accounts" ] || [ "$count" -eq 0 ]; then
  echo "PASS -- 0 accounts"
else
  ready=false
  echo "FAIL -- $count account(s) present, must all be removed via Settings > Accounts:"
  printf '%s\n' "$accounts" | sed 's/^\s*/  - /'
fi

echo
echo "== 2. Extra Android user profiles (must be only user 0) =="
users="$(adbs shell pm list users | tr -d '\r')"
extra_users="$(printf '%s\n' "$users" | grep -F 'UserInfo{' | grep -vF 'UserInfo{0:' || true)"
if [ -z "$extra_users" ]; then
  echo "PASS -- only the primary user exists"
else
  ready=false
  echo "FAIL -- extra user profile(s) found (e.g. Secure Folder); remove via Settings:"
  printf '%s\n' "$extra_users" | sed 's/^\s*/  - /'
fi

echo
echo "== 3. Existing device owner (must be none, unless re-running after enrollment) =="
owners="$(adbs shell dpm list-owners | tr -d '\r')"
if printf '%s\n' "$owners" | grep -qi "no owners"; then
  echo "PASS -- no device owner set yet"
else
  echo "INFO -- a device owner is already set:"
  printf '%s\n' "$owners" | sed 's/^/  /'
fi

echo
echo "== 4. Apps known to hold stubborn account tokens (informational) =="
# Per docs/phase0-test-report.md Phone 1: pm clear does not drop these tokens,
# only a full uninstall does -- listed here so they're planned for, not
# discovered mid-removal. Extend this list as new OEMs/apps surface more.
watch_packages="com.facebook.katana com.facebook.orca com.facebook.stella com.instagram.android com.instagram.barcelona com.whatsapp com.google.android.apps.tachyon com.truecaller com.airbnb.android"
installed="$(adbs shell pm list packages | tr -d '\r')"
found=""
for pkg in $watch_packages; do
  if printf '%s\n' "$installed" | grep -q "package:$pkg$"; then
    found="$found $pkg"
  fi
done
if [ -z "$found" ]; then
  echo "none of the known-stubborn apps are installed"
else
  echo "installed, may need a full uninstall (not just logout) to clear their account token:"
  for pkg in $found; do echo "  - $pkg"; done
  echo "  (reinstall + log back in afterward -- your login/password isn't stored by this script"
  echo "   or lost by uninstalling; it's already in your own password manager / memory, and the"
  echo "   account itself lives server-side, not on this phone)"
fi

echo
echo "================================================================"
if $ready; then
  echo "READY -- accounts and extra users are clear. Next: adb -s $SERIAL shell dpm set-device-owner com.manara.agent/.OwnerReceiver"
else
  echo "NOT READY -- resolve the FAIL items above, then re-run this script."
fi
