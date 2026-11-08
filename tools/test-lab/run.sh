#!/usr/bin/env bash
# Runs Manara on real phones in Firebase Test Lab (docs/testing.md, layer 3).
#
# Once on this computer:
#   1. Install the Google Cloud CLI: https://cloud.google.com/sdk/docs/install
#   2. gcloud auth login
#   3. gcloud config set project <your Firebase project id>   (the one push uses)
#   4. Enable "Cloud Testing API" and "Cloud Tool Results API" for that project.
#
# Then:
#   tools/test-lab/run.sh models    list the real phones Test Lab has, by popular brand
#   tools/test-lab/run.sh robo      crawl the store build's screens on every phone in models.txt
#   tools/test-lab/run.sh matrix    make each phone device owner and check every rule
#                                   (only works on a phone with no Google account signed in;
#                                   the test reports the refusal otherwise)
#
# No-cost plan: 5 runs a day on real phones; one phone in one run counts as one.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
agent="$here/../../agent"
models_file="${MODELS_FILE:-$here/models.txt}"

device_flags() {
    local flags=()
    while IFS=, read -r model version; do
        model="${model%%#*}"; model="$(echo "$model" | tr -d '[:space:]')"
        version="$(echo "${version:-}" | tr -d '[:space:]')"
        [ -z "$model" ] && continue
        flags+=(--device "model=$model,version=$version,locale=en,orientation=portrait")
    done < "$models_file"
    if [ ${#flags[@]} -eq 0 ]; then
        echo "No phones listed in $models_file: run '$0 models' and add lines like: a52sxq,34" >&2
        exit 1
    fi
    printf '%s\n' "${flags[@]}"
}

case "${1:-}" in
    models)
        gcloud firebase test android models list \
            --filter="form=PHYSICAL AND (brand~'(?i)samsung|xiaomi|redmi|oppo|vivo|realme|motorola|google|tecno|infinix')"
        ;;
    robo)
        (cd "$agent" && ./gradlew.bat assembleRelease -q -PMANARA_API_URL="${MANARA_API_URL:-https://manara-api-pvu4.onrender.com/api/v1/}")
        mapfile -t devices < <(device_flags)
        gcloud firebase test android run --type robo \
            --app "$agent/app/build/outputs/apk/release/app-release.apk" \
            --timeout 5m "${devices[@]}"
        ;;
    matrix)
        (cd "$agent" && ./gradlew.bat assembleDebug assembleDebugAndroidTest -q)
        mapfile -t devices < <(device_flags)
        gcloud firebase test android run --type instrumentation \
            --app "$agent/app/build/outputs/apk/debug/app-debug.apk" \
            --test "$agent/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk" \
            --test-targets "class com.manara.agent.matrix.ManagedMatrixTest" \
            --environment-variables throwawayDevice=true \
            --timeout 10m "${devices[@]}"
        ;;
    *)
        sed -n '2,20p' "$0"
        exit 1
        ;;
esac
