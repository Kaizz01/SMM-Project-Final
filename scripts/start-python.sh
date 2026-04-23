#!/bin/bash
# Starts the Python solver (FastAPI/uvicorn) in the background, then Next.js in the foreground.
# The frontend auto-detects the solver on /health and uses it transparently.

PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

export NVM_DIR="$HOME/.nvm"
if [ ! -d "$NVM_DIR" ]; then
    echo " ░░ Installation de nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

REQUIRED=20
CURRENT=$(node -e "process.stdout.write(process.version)" 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$CURRENT" ] || [ "$CURRENT" -lt "$REQUIRED" ]; then
    nvm install $REQUIRED
    nvm use $REQUIRED
fi

if ! command -v pnpm &>/dev/null; then
    curl -fsSL https://get.pnpm.io/install.sh | sh -
    export PATH="$PNPM_HOME:$PATH"
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

OXIDE_BINDING="$PROJECT_DIR/node_modules/.pnpm/@tailwindcss+oxide@4.2.0/node_modules/@tailwindcss/oxide/tailwindcss-oxide.linux-x64-gnu.node"
if [ ! -d "$PROJECT_DIR/node_modules" ] || [ ! -f "$OXIDE_BINDING" ]; then
    echo " ░░ Reinstallation des dependances..."
    rm -rf "$PROJECT_DIR/node_modules" "$PROJECT_DIR/.next"
    pnpm --dir "$PROJECT_DIR" install || exit 1
fi

# Python venv setup
VENV_DIR="$PROJECT_DIR/.venv"
echo " ░░ Preparation de l'environnement Python..."
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
fi
"$VENV_DIR/bin/pip" install -q -r "$PROJECT_DIR/scripts/requirements.txt"

# Start solver
echo " ░░ Demarrage du solver Python (port 8000)..."
cd "$PROJECT_DIR"
"$VENV_DIR/bin/uvicorn" scripts.solver:app --port 8000 &
SOLVER_PID=$!
echo " ░░ Solver PID: $SOLVER_PID"

# Kill solver on exit (Ctrl+C or natural termination)
trap "echo ' ░░ Arret du solver Python...'; kill $SOLVER_PID 2>/dev/null" EXIT

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

echo " ░░ Demarrage de Next.js (port 3000)..."
echo " ░░ Ctrl+C pour tout arreter"
echo ""


pnpm --dir "$PROJECT_DIR" dev --hostname 0.0.0.0 --port 3000
