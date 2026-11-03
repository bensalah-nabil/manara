#!/usr/bin/env bash
# Automates the part of ADR-0003's account removal that CAN be automated:
# apps whose account token is tied to the app itself (Duo, Truecaller,
# Facebook, Messenger, WhatsApp per docs/phase0-test-report.md's Phone 1
# finding -- `pm clear` does not drop these tokens, only uninstalling the
# app does). Google/Samsung accounts have no adb/API-level removal and stay
# manual via Settings -- this script does not touch those.
#
# For each known account-tied app that's installed:
#   1. pulls its APK(s) (handles split APKs) to a local backup dir
#   2. fully uninstalls it (no -k)
#
# Tried `uninstall -k` (keep data) first, expecting it to clear the account
# token while preserving local app data. Verified on a real device it does
# NOT: Android only purges an authenticator's AccountManager entries on a
# *full* package removal signal, which -k deliberately suppresses (that's
# what "keep data" means to the OS). Confirmed by re-running
# scripts/enroll-preflight.sh after a -k uninstall of all 5 apps -- all 7
# accounts, unchanged. Matches docs/phase0-test-report.md's original Phone 1
# finding ("had to fully uninstall... pm clear did not remove them") --
# this is the same mechanism, -k just wasn't tested against it before. So:
# full uninstall it is. Local app data (not the login, which always needed
# re-entry) is lost; the APK itself is still restorable from the backup.
#
# Nothing here reads, stores, or needs any password -- see the "On
# credentials" note in ../agent/README.md.
#
# Usage: scripts/enroll-backup-apps.sh <serial> [backup-dir]

set -euo pipefail

# Git Bash/MSYS rewrites an argument that looks like a Unix absolute path
# (e.g. /data/app/Duo/Duo.apk, a remote path passed straight through to
# adb.exe) into a Windows path rooted at the Git install dir before adb
# ever sees it -- this stops that for every command in this script.
export MSYS_NO_PATHCONV=1

SERIAL="${1:?usage: enroll-backup-apps.sh <serial> [backup-dir]}"
BACKUP_ROOT="${2:-$(dirname "$0")/.enroll-backups}"
ADB="${ADB:-C:/Users/nbensalah/AppData/Local/Android/Sdk/platform-tools/adb.exe}"

adbs() { "$ADB" -s "$SERIAL" "$@"; }

# Key the backup dir by the device's stable hardware serial, not the
# connection address -- wireless-debugging IP:port changes on every
# re-pair/reconnect (DHCP lease change, toggling the feature off/on), which
# would otherwise orphan backups under a dead directory name.
DEVICE_SERIAL="$(adbs shell getprop ro.serialno | tr -d '\r')"
if [ -z "$DEVICE_SERIAL" ]; then
  DEVICE_SERIAL="${SERIAL//:/_}"
fi

# account type (from `dumpsys account`) -> installable package. com.google
# is deliberately absent: no package uninstall removes a Google account,
# it must be removed by hand via Settings.
declare -A TYPE_TO_PKG=(
  [com.google.android.apps.tachyon]="com.google.android.apps.tachyon"
  [com.truecaller.account]="com.truecaller"
  [com.facebook.auth.login]="com.facebook.katana"
  [com.facebook.messenger]="com.facebook.orca"
  [com.whatsapp]="com.whatsapp"
)

BACKUP_DIR="$BACKUP_ROOT/$DEVICE_SERIAL"
mkdir -p "$BACKUP_DIR"

echo "== Detecting account-tied apps on $SERIAL =="
account_types="$(adbs shell dumpsys account | tr -d '\r' | grep -oE 'type=[A-Za-z0-9_.]+' | sed 's/type=//' | sort -u)"

to_backup=()
for type in $account_types; do
  pkg="${TYPE_TO_PKG[$type]:-}"
  if [ -z "$pkg" ]; then
    if [ "$type" = "com.google" ]; then
      echo "skip  -- com.google account present, remove manually via Settings (no adb path)"
    else
      echo "skip  -- unknown account type '$type', no package mapping; remove manually"
    fi
    continue
  fi
  if adbs shell pm path "$pkg" > /dev/null 2>&1; then
    to_backup+=("$pkg")
  else
    echo "skip  -- $pkg not installed (account type $type had no matching app)"
  fi
done

if [ "${#to_backup[@]}" -eq 0 ]; then
  echo "nothing to back up -- no automatable account-tied apps found installed"
  exit 0
fi

for pkg in "${to_backup[@]}"; do
  echo
  echo "== $pkg =="
  pkg_dir="$BACKUP_DIR/$pkg"
  mkdir -p "$pkg_dir"

  if compgen -G "$pkg_dir/*.apk" > /dev/null; then
    echo "already backed up in $pkg_dir -- skipping re-pull"
  else
    paths="$(adbs shell pm path "$pkg" | tr -d '\r' | sed 's/^package://')"
    n=0
    while IFS= read -r remote_path; do
      [ -z "$remote_path" ] && continue
      local_name="$(basename "$remote_path")"
      adbs pull "$remote_path" "$pkg_dir/$local_name" > /dev/null
      n=$((n + 1))
    done <<< "$paths"
    echo "backed up $n APK part(s) to $pkg_dir"
  fi

  if ! adbs shell pm path "$pkg" > /dev/null 2>&1; then
    echo "$pkg already uninstalled"
  elif adbs uninstall "$pkg" > /dev/null 2>&1; then
    echo "uninstalled $pkg"
  else
    # A plain `adb uninstall` fails with DELETE_FAILED_INTERNAL_ERROR for a
    # preinstalled/system app (Duo on this device: installed at
    # /data/app/Duo/Duo.apk, not the usual per-user hashed path) -- this
    # per-user form is the standard way to remove one without root.
    adbs shell pm uninstall --user 0 "$pkg" > /dev/null
    echo "uninstalled $pkg (--user 0, system app)"
  fi
done

echo
echo "================================================================"
echo "Backed up and uninstalled ${#to_backup[@]} app(s) in $BACKUP_DIR"
echo "Remaining manual step: remove the Google/Samsung account(s) via Settings."
echo "After enrollment, run: scripts/enroll-restore-apps.sh $SERIAL \"$BACKUP_ROOT\""
