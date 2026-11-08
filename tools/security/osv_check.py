"""Known-vulnerability check for the Android app's libraries (MASA 1.6.2.1, docs/security.md).

Reads a Gradle dependency tree (`gradlew :app:dependencies --configuration
releaseRuntimeClasspath`) from stdin or a file, takes the version Gradle
actually resolved for each library, and asks OSV.dev (https://osv.dev) about
each one. Sends only library coordinates. Exits 1 if any has a known
vulnerability, 0 if none, 2 if OSV.dev can't be reached.

    python tools/security/osv_check.py deps.txt
"""
import json
import re
import sys
import urllib.request

# "+--- group:artifact:requested -> resolved (*)" or "+--- group:artifact:version"
LINE = re.compile(r"[+\\]--- ([\w.\-]+):([\w.\-]+):([\w.\-]+)(?: -> ([\w.\-]+))?")
OSV = "https://api.osv.dev/v1/querybatch"


def resolved(lines):
    found = {}
    for line in lines:
        m = LINE.search(line)
        if not m:
            continue
        group, artifact, requested, actual = m.groups()
        found[f"{group}:{artifact}"] = actual or requested
    return found


def query(packages):
    queries = [{"package": {"ecosystem": "Maven", "name": name}, "version": version}
               for name, version in sorted(packages.items())]
    hits = {}
    for start in range(0, len(queries), 500):
        batch = queries[start:start + 500]
        req = urllib.request.Request(OSV, data=json.dumps({"queries": batch}).encode(),
                                     headers={"Content-Type": "application/json", "User-Agent": "manara-osv-check"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            results = json.load(resp)["results"]
        for q, r in zip(batch, results):
            ids = [v["id"] for v in r.get("vulns", [])]
            if ids:
                hits[f"{q['package']['name']}:{q['version']}"] = ids
    return hits


def main():
    source = open(sys.argv[1], encoding="utf-8") if len(sys.argv) > 1 else sys.stdin
    packages = resolved(source)
    if not packages:
        print("No dependencies found in the input: run gradlew :app:dependencies first.")
        return 2
    try:
        hits = query(packages)
    except OSError as error:
        print(f"OSV.dev not reachable: {error}")
        return 2
    print(f"Checked {len(packages)} libraries against OSV.dev.")
    for package, ids in sorted(hits.items()):
        print(f"  {package}: {', '.join(ids)}")
    if hits:
        print(f"{len(hits)} with known vulnerabilities.")
        return 1
    print("No known vulnerabilities.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
