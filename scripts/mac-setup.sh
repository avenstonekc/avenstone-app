#!/usr/bin/env bash
# Avenstone — one-command Mac bootstrap
# Usage (on a fresh Mac, no copy-paste needed after this line):
#   curl -fsSL https://raw.githubusercontent.com/avenstonekc/avenstone-app/main/scripts/mac-setup.sh | bash
set -e

REPO_URL="https://github.com/avenstonekc/avenstone-app.git"
REPO_DIR="$HOME/Documents/avenstone-app"
VITE_DIR="$REPO_DIR/avenstone-vite"

say() { printf "\n\033[1;34m==> %s\033[0m\n" "$1"; }
ok()  { printf "\033[1;32m  ✓ %s\033[0m\n" "$1"; }
warn(){ printf "\033[1;33m  ! %s\033[0m\n" "$1"; }

# 1. Xcode Command Line Tools (gives us git, clang, make, etc.)
if ! xcode-select -p >/dev/null 2>&1; then
  say "Installing Xcode Command Line Tools (a GUI dialog will appear — click Install, then re-run this script)"
  xcode-select --install || true
  exit 0
fi
ok "Xcode Command Line Tools present"

# 2. Homebrew
if ! command -v brew >/dev/null 2>&1; then
  say "Installing Homebrew"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for Apple Silicon and Intel Macs
  if [ -f /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
  elif [ -f /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi
ok "Homebrew: $(brew --version | head -1)"

# 3. Node
if ! command -v node >/dev/null 2>&1; then
  say "Installing Node via Homebrew"
  brew install node
fi
ok "Node: $(node --version)"

# 4. CocoaPods (Capacitor iOS needs this)
if ! command -v pod >/dev/null 2>&1; then
  say "Installing CocoaPods"
  brew install cocoapods
fi
ok "CocoaPods: $(pod --version)"

# 5. Clone or update repo
if [ ! -d "$REPO_DIR" ]; then
  say "Cloning Avenstone repo to $REPO_DIR"
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone "$REPO_URL" "$REPO_DIR"
else
  say "Updating existing repo at $REPO_DIR"
  cd "$REPO_DIR"
  git pull --ff-only || warn "git pull failed — resolve manually in $REPO_DIR"
fi
ok "Repo ready at $REPO_DIR"

# 6. npm install
say "Running npm install (this takes a minute)"
cd "$VITE_DIR"
npm install

# 7. Build the web assets so Capacitor has something to sync
say "Building web assets (npm run build)"
npm run build

# 8. Sync Capacitor iOS (runs pod install for us)
say "Syncing Capacitor iOS (pod install)"
npx cap sync ios

# 9. Open Xcode
say "Opening Xcode — wait for it to finish indexing, then:"
printf "  1. Click \"App\" in the left sidebar\n"
printf "  2. Go to \"Signing & Capabilities\" tab\n"
printf "  3. Team dropdown → sign in with your Apple Developer account\n"
printf "  4. Press the ▶ Play button (top-left) with target = iPhone 15 Pro Simulator\n\n"
npx cap open ios

ok "Setup complete. If anything failed above, copy the red text and send it to Claude."
