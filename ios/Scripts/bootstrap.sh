#!/usr/bin/env bash
# Generate HomeIntercom.xcodeproj from project.yml. Safe to re-run — the
# project file is disposable and regenerated from scratch every time.
set -euo pipefail

cd "$(dirname "$0")/.."

# Set XCODEGEN=/path/to/xcodegen to use a build that isn't on your PATH, e.g.
# one you built from source without installing it system-wide.
XCODEGEN="${XCODEGEN:-xcodegen}"

if ! command -v "$XCODEGEN" >/dev/null 2>&1; then
  cat >&2 <<'HELP'
XcodeGen isn't installed. Two ways to get it:

  With Homebrew (easiest, and worth having on a dev Mac anyway):
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      # then follow the "Next steps" the installer prints, and:
      brew install xcodegen

  Without Homebrew — build it with the Swift toolchain Xcode already provides:
      git clone https://github.com/yonaskolb/XcodeGen.git ~/XcodeGen
      cd ~/XcodeGen && make install
      # If `make install` can't write to /usr/local, skip installing and run
      # this script as:
      #     XCODEGEN="swift run --package-path ~/XcodeGen xcodegen" ./Scripts/bootstrap.sh

HELP
  exit 1
fi

if [ ! -f Local.xcconfig ]; then
  cp Local.xcconfig.example Local.xcconfig
  echo "Created ios/Local.xcconfig — set DEVELOPMENT_TEAM there to run on a device."
fi

# Unquoted on purpose: XCODEGEN may carry arguments (the `swift run` form above).
# shellcheck disable=SC2086
$XCODEGEN generate

echo
echo "Generated $(pwd)/HomeIntercom.xcodeproj"
echo "Open it with:  open HomeIntercom.xcodeproj"
echo "Xcode will resolve the LiveKit Swift package on first open (needs network)."
