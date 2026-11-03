#!/usr/bin/env bash
# Restores the apps scripts/enroll-backup-apps.sh backed up and removed,
# after `dpm set-device-owner` has succeeded. Reinstalls each app from its
# backed-up APK(s); since the app's local data was kept on the device
# (uninstall -k), it reattaches automatically on reinstall. Logging back in
# afterward is expected -- the account token was deliberately cleared, this
# script does not and cannot restore it (see "On credentials" in
# ../agent/README.md).
#
# Reads the package list straight from the backup directory's structure
# (one subdirectory per package, containing its APK part(s)) rather than a
# separate manifest file -- enroll-backup-apps.sh can be interrupted and
# resumed across several runs (a dropped wireless-debugging connection is
# common), and a manifest written per-run would miss packages backed up in
# an earlier run.
#
# Usage: scripts/enroll-restore-apps.sh <serial> [backup-dir]

set -euo pipefail

# See the matching note in enroll-backup-apps.sh -- same Git Bash/MSYS
# absolute-path rewriting risk applies here too.
export MSYS_NO_PATHCONV=1

SERIAL="${1:?usage: enroll-restore-apps.sh <serial> [backup-dir]}"
BACKUP_ROOT="${2:-$(dirname "$0")/.enroll-backups}"
ADB="${ADB:-C:/Users/nbensalah/AppData/Local/Android/Sdk/platform-tools/adb.exe}"

adbs() { "$ADB" -s "$SERIAL" "$@"; }

# Same stable-serial key as enroll-backup-apps.sh -- see its comment.
DEVICE_SERIAL="$(adbs shell getprop ro.serialno | tr -d '\r')"
if [ -z "$DEVICE_SERIAL" ]; then
  DEVICE_SERIAL="${SERIAL//:/_}"
fi
BACKUP_DIR="$BACKUP_ROOT/$DEVICE_SERIAL"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "no backup dir found at $BACKUP_DIR -- nothing to restore (did enroll-backup-apps.sh run for this serial?)" >&2
  exit 1
fi

# Smallest total APK size first: wireless debugging has been dropping
# mid-transfer on this device specifically under sustained load, so a big
# app (Facebook's 16-part split) shouldn't cost re-doing smaller ones that
# would otherwise have already succeeded on retry.
ordered_dirs="$(du -s "$BACKUP_DIR"/*/ 2>/dev/null | sort -n | cut -f2-)"

restored=0
considered=0
while IFS= read -r pkg_dir; do
  [ -d "$pkg_dir" ] || continue
  pkg="$(basename "$pkg_dir")"
  apk_files=("$pkg_dir"*.apk)
  if [ ! -e "${apk_files[0]}" ]; then
    continue
  fi
  considered=$((considered + 1))

  # < /dev/null on every adb call below: `adb shell` forwards stdin to the
  # device, and without this it consumes the rest of $ordered_dirs out from
  # under this loop's `read`, silently stopping after the first package.
  if adbs shell pm path "$pkg" < /dev/null > /dev/null 2>&1; then
    echo
    echo "== $pkg == already installed, skipping"
    continue
  fi

  echo
  echo "== $pkg =="
  # A preinstalled/OEM app (Duo on the SM-A045F) still has a stub on the
  # system/product partition after `pm uninstall --user 0` -- reinstalling
  # the pulled APK over it fails (INSTALL_FAILED_UPDATE_INCOMPATIBLE,
  # signature mismatch against that stub). `pm install-existing` re-enables
  # the stub for this user directly, no APK transfer needed, and fails
  # harmlessly for a normal app that has no such stub.
  if adbs shell cmd package install-existing "$pkg" < /dev/null > /dev/null 2>&1; then
    echo "reinstalled $pkg (install-existing, system/OEM stub)"
  elif [ "${#apk_files[@]}" -gt 1 ]; then
    adbs install-multiple "${apk_files[@]}" < /dev/null
    echo "reinstalled $pkg -- open it and log back in"
  else
    adbs install "${apk_files[0]}" < /dev/null
    echo "reinstalled $pkg -- open it and log back in"
  fi
  restored=$((restored + 1))
done <<< "$ordered_dirs"

if [ "$considered" -eq 0 ]; then
  echo "nothing to restore -- no package subdirectories with APKs found under $BACKUP_DIR" >&2
  exit 1
fi

echo
echo "================================================================"
echo "Restored $restored app(s) this run ($((considered - restored)) already installed)."
echo "Remaining manual step: sign back into the Google/Samsung account(s)"
echo "via Settings (device owner persists through this, per ADR-0003)."
