#!/usr/bin/env bash

set -euo pipefail

REPO_URL="https://github.com/thovz14/Dashboard.git"
PROJECT_DIR="${1:-.}/Dashboard-goed"
INSTALLER="apt"
SUDO=""

if [[ $(id -u) -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        echo "Dit script moet met root-rechten draaien of sudo beschikbaar zijn."
        exit 1
    fi
fi

function info() {
    echo "[INFO] $*"
}

function clone_repo() {
    if [[ ! -d "$PROJECT_DIR" ]]; then
        info "Repository klonen van $REPO_URL naar $PROJECT_DIR"
        git clone "$REPO_URL" "$PROJECT_DIR"
    else
        info "Project-map bestaat al: $PROJECT_DIR"
    fi
}

function install_packages() {
    local pkgs=(curl ca-certificates gnupg lsb-release build-essential python3 python3-pip ffmpeg git)
    info "Pakketbron updaten en upgrade-check"
    $SUDO apt update -y
    info "Packages installeren: ${pkgs[*]}"
    $SUDO apt install -y "${pkgs[@]}"
}

function install_node() {
    if command -v node >/dev/null 2>&1; then
        local version
        version=$(node -v | sed 's/^v//')
        info "Gevonden Node.js versie $version"
    fi

    if ! command -v node >/dev/null 2>&1 || [[ "${version%%.*}" -lt 18 ]]; then
        info "Node.js 20 installeren via NodeSource"
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO apt install -y nodejs
    fi

    if ! command -v npm >/dev/null 2>&1; then
        info "npm installeren"
        $SUDO apt install -y npm
    fi
}

function install_yt_dlp() {
    if ! command -v yt-dlp >/dev/null 2>&1; then
        info "yt-dlp installeren via pip"
        $SUDO python3 -m pip install --upgrade pip
        $SUDO python3 -m pip install --upgrade yt-dlp
    else
        info "yt-dlp al aanwezig"
    fi
}

function install_node_deps() {
    info "Node dependencies installeren"
    cd "$PROJECT_DIR"

    if [[ -f package-lock.json ]]; then
        npm ci
    else
        npm install
    fi

    npm install express cors firebase-admin ssh2 uuid --save
}

function prepare_data_dirs() {
    info "Data- en downloadmappen klaarzetten"
    mkdir -p "$PROJECT_DIR/data"
    mkdir -p "$PROJECT_DIR/downloads"
    if [[ ! -f "$PROJECT_DIR/data/servers.json" ]]; then
        echo '[]' > "$PROJECT_DIR/data/servers.json"
    fi
    if [[ ! -f "$PROJECT_DIR/data/downloads.json" ]]; then
        echo '[]' > "$PROJECT_DIR/data/downloads.json"
    fi
}

function create_systemd_service() {
    local service_path="/etc/systemd/system/dashboard.service"
    local user_name="${SUDO_USER:-$(whoami)}"
    if [[ -f "$service_path" ]]; then
        info "Systemd service bestaat al: $service_path"
        return
    fi

    info "Systemd service aanmaken in $service_path"
    $SUDO tee "$service_path" >/dev/null <<EOF
[Unit]
Description=Dashboard Node API
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$(command -v node) $PROJECT_DIR/server.js
Restart=always
RestartSec=5
User=$user_name
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    $SUDO systemctl daemon-reload
    info "Service inschakelen"
    $SUDO systemctl enable dashboard.service
}

function show_next_steps() {
    echo
    echo "Installatie compleet!"
    echo "De server staat klaar in: $PROJECT_DIR"
    echo
    echo "Start handmatig met:"
    echo "  cd $PROJECT_DIR"
    echo "  node server.js"
    echo
    echo "Of gebruik de systemd-service:"
    echo "  sudo systemctl start dashboard.service"
    echo "  sudo systemctl status dashboard.service"
    echo
    echo "Test de backend met:"
    echo "  curl http://localhost:3000/api/status"
}

install_packages
clone_repo
install_node
install_yt_dlp
install_node_deps
prepare_data_dirs
create_systemd_service
show_next_steps
