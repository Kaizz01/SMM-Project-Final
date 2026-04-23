#!/bin/bash

PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

# Install / load nvm
export NVM_DIR="$HOME/.nvm"
if [ ! -d "$NVM_DIR" ]; then
    echo " ░░ Installation de nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Ensure Node >= 20
REQUIRED=20
CURRENT=$(node -e "process.stdout.write(process.version)" 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$CURRENT" ] || [ "$CURRENT" -lt "$REQUIRED" ]; then
    echo " ░░ Mise a jour de Node.js (>= $REQUIRED)..."
    nvm install $REQUIRED
    nvm use $REQUIRED
fi
echo " ░░ Node $(node --version) / npm $(npm --version)"

if ! command -v pnpm &>/dev/null; then
    echo " ░░ Installation de pnpm..."
    curl -fsSL https://get.pnpm.io/install.sh | sh -
    export PATH="$PNPM_HOME:$PATH"
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Reinstall if node_modules is absent or the tailwindcss-oxide native binding is missing
OXIDE_BINDING="$PROJECT_DIR/node_modules/.pnpm/@tailwindcss+oxide@4.2.0/node_modules/@tailwindcss/oxide/tailwindcss-oxide.linux-x64-gnu.node"

if [ ! -d "$PROJECT_DIR/node_modules" ] || [ ! -f "$OXIDE_BINDING" ]; then
    echo " ░░ Reinstallation des dependances (binaires Linux manquants)..."
    rm -rf "$PROJECT_DIR/node_modules" "$PROJECT_DIR/.next"
    pnpm --dir "$PROJECT_DIR" install || exit 1
fi

LOG=/tmp/simm-dev.log
> "$LOG"

echo " ░░ Demarrage du serveur..."
echo " ░░ Ctrl+C pour arreter"
echo ""

# Auto-open browser once Next.js responds
(
    for i in $(seq 1 30); do
        sleep 2
        if curl -s -o /dev/null http://localhost:3000 2>/dev/null; then
            cmd.exe /c start http://localhost:3000 2>/dev/null
            break
        fi
    done
) &

# Start Next.js in foreground
pnpm --dir "$PROJECT_DIR" dev --hostname 0.0.0.0 --port 3000
