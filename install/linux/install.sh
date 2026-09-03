#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
install_dir=$(printenv INSTALL_DIR 2>/dev/null || true)
admin_username=$(printenv CASE_ADMIN_USERNAME 2>/dev/null || true)
admin_password=$(printenv CASE_ADMIN_PASSWORD 2>/dev/null || true)
port=$(printenv CASE_ADMIN_PORT 2>/dev/null || true)
force_config=$(printenv FORCE_CONFIG 2>/dev/null || true)
[ -n "$install_dir" ] || install_dir="$HOME/.local/share/bai-yunfei-portal"
[ -n "$admin_username" ] || admin_username=admin
[ -n "$admin_password" ] || admin_password=admin123
[ -n "$port" ] || port=4173
[ -n "$force_config" ] || force_config=0

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install Node.js 22.16 or newer." >&2
  exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=16)?0:1)"; then
  echo "Node.js 22.16 or newer is required. Current: $(node --version)" >&2
  exit 1
fi
if [ "$(expr length "$admin_password")" -lt 8 ]; then
  echo "CASE_ADMIN_PASSWORD must contain at least 8 characters." >&2
  exit 1
fi

mkdir -p "$install_dir" "$install_dir/data"
if [ "$source_root" != "$install_dir" ]; then
  for item in dist scripts config bin node_modules package.json .env.example INSTALL.md THIRD_PARTY_NOTICES.md; do
    if [ ! -e "$source_root/$item" ]; then
      echo "Installation package is missing: $item" >&2
      exit 1
    fi
    cp -R "$source_root/$item" "$install_dir/"
  done
fi

env_file="$install_dir/.env.local"
if [ ! -f "$env_file" ] || [ "$force_config" = "1" ]; then
  encryption_key=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  {
    echo "CASE_ADMIN_USERNAME=$admin_username"
    echo "CASE_ADMIN_PASSWORD=$admin_password"
    echo "CASE_ADMIN_HOST=127.0.0.1"
    echo "CASE_ADMIN_PORT=$port"
    echo "CASE_DATA_DIR=data"
    echo "CASE_BACKUP_LIMIT=10"
    echo "CASE_SESSION_HOURS=8"
    echo "COMMUNITY_SESSION_DAYS=30"
    echo "PORTAL_ENCRYPTION_KEY=$encryption_key"
  } > "$env_file"
  chmod 600 "$env_file"
fi
chmod +x "$install_dir/bin/start-linux.sh"

echo
echo "Bai Yunfei portal installed."
echo "Install directory: $install_dir"
echo "Knowledge and AI admin: http://127.0.0.1:$port/admin/knowledge"
echo "Users and community admin: http://127.0.0.1:$port/admin/users"
echo "Start command: $install_dir/bin/start-linux.sh"
