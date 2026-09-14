#!/usr/bin/env bash
# Generate HomeIntercom.xcodeproj from project.yml. Safe to re-run — the
# project file is disposable and regenerated from scratch every time.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "XcodeGen is not installed. Install it with:" >&2
  echo "    brew install xcodegen" >&2
  echo "(or see https://github.com/yonaskolb/XcodeGen#installing)" >&2
  exit 1
fi

if [ ! -f Local.xcconfig ]; then
  cp Local.xcconfig.example Local.xcconfig
  echo "Created ios/Local.xcconfig — set DEVELOPMENT_TEAM there to run on a device."
fi

xcodegen generate

echo
echo "Generated $(pwd)/HomeIntercom.xcodeproj"
echo "Open it with:  open HomeIntercom.xcodeproj"
echo "Xcode will resolve the LiveKit Swift package on first open (needs network)."
