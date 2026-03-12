#!/usr/bin/env bash

set -e

CLEAN=0
NUKE=0
PASSTHROUGH_ARGS=()

for arg in "$@"; do
  case $arg in
    --clean|-clean)
      CLEAN=1
      ;;
    --nuke|-nuke)
      NUKE=1
      ;;
    *)
      PASSTHROUGH_ARGS+=("$arg")
      ;;
  esac
done

write_step() {
  echo -e "\n\033[36m--> $1\033[0m"
}

write_host() {
  echo -e "  $1"
}

write_host_color() {
  local color=$1
  local text=$2
  case $color in
    gray) echo -e "  \033[90m$text\033[0m" ;;
    green) echo -e "  \033[32m$text\033[0m" ;;
    yellow) echo -e "  \033[33m$text\033[0m" ;;
    darkyellow) echo -e "  \033[33m$text\033[0m" ;;
    red) echo -e "  \033[31m$text\033[0m" ;;
    cyan) echo -e "  \033[36m$text\033[0m" ;;
    *) echo -e "  $text" ;;
  esac
}

write_warning() {
  echo -e "\033[33mWARNING: $1\033[0m"
}

write_error() {
  echo -e "\033[31mERROR: $1\033[0m"
}

# 1. CLEANUP (Ghost Data & Cache)
if [ $CLEAN -eq 1 ]; then
  write_step "Cleaning local data and build artifacts..."
  targets=(".opencode" "dist" "packages/opencode/dist" "packages/app/dist")
  for target in "${targets[@]}"; do
    if [ -e "$target" ]; then
      write_host_color "gray" "Removing $target..."
      rm -rf "$target"
    fi
  done
  write_host_color "green" "Cleanup complete."
fi

# 1.5. NUKE (Full Reset - Wipe All Accumulated Data)
if [ $NUKE -eq 1 ]; then
  write_step "NUKING ALL ACCUMULATED DATA (Global & Local)..."
  write_host_color "yellow" "This will reset: favorites, recent models, API keys, sessions"
  write_host_color "green" "Preserved: config files (Ollama/provider settings)"

  local_targets=(".opencode" "dist" "packages/opencode/dist" "packages/app/dist")
  for target in "${local_targets[@]}"; do
    if [ -e "$target" ]; then
      write_host_color "gray" "Removing $target..."
      rm -rf "$target"
    fi
  done

  # Global config legacy
  global_config="$HOME/.opencode"
  if [ -e "$global_config" ]; then
    write_host_color "darkyellow" "Removing legacy global config: $global_config ..."
    rm -rf "$global_config"
  fi

  # XDG State Directory
  xdg_state="${XDG_STATE_HOME:-$HOME/.local/state}/opencode"
  if [ -e "$xdg_state" ]; then
    write_host_color "red" "Removing XDG state (favorites, recent models): $xdg_state ..."
    rm -rf "$xdg_state"
  fi

  # XDG Data Directory
  xdg_data="${XDG_DATA_HOME:-$HOME/.local/share}/opencode"
  if [ -e "$xdg_data" ]; then
    write_host_color "red" "Removing XDG data (auth keys, sessions, storage): $xdg_data ..."
    rm -rf "$xdg_data"
  fi

  # XDG Cache Directory
  xdg_cache="${XDG_CACHE_HOME:-$HOME/.cache}/opencode"
  if [ -e "$xdg_cache" ]; then
    write_host_color "red" "Removing XDG cache (model definitions, LSP): $xdg_cache ..."
    rm -rf "$xdg_cache"
  fi

  echo ""
  write_host_color "cyan" "[!] Config preserved at ~/.config/opencode (provider/Ollama settings intact)"
  write_host_color "green" "Nuke complete. All accumulated data wiped. Start fresh!"
fi

# 2. DEPENDENCIES
write_step "Checking dependencies..."
if ! command -v bun &> /dev/null; then
  write_error "Bun is not installed. Please run: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

write_step "Installing packages..."
bun install

# 2.5. REGISTER GLOBAL COMMAND
write_step "Registering 'map-dev' command globally..."
INSTALL_DIR="$HOME/.opencode/bin"
REPO_ROOT="$(pwd)"

mkdir -p "$INSTALL_DIR"

cat <<EOF > "$INSTALL_DIR/map-dev"
#!/usr/bin/env bash
export OPENCODE_CWD="\$(pwd)"
cd "$REPO_ROOT" && bun dev "\$@"
EOF
chmod +x "$INSTALL_DIR/map-dev"

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.config}
current_shell=$(basename "$SHELL")
case $current_shell in
    fish) config_files="$HOME/.config/fish/config.fish" ;;
    zsh) config_files="${ZDOTDIR:-$HOME}/.zshrc ${ZDOTDIR:-$HOME}/.zshenv $XDG_CONFIG_HOME/zsh/.zshrc $XDG_CONFIG_HOME/zsh/.zshenv" ;;
    bash) config_files="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile $XDG_CONFIG_HOME/bash/.bashrc $XDG_CONFIG_HOME/bash/.bash_profile" ;;
    *) config_files="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile" ;;
esac

add_to_path() {
    local config_file=$1
    local command=$2
    if grep -Fxq "$command" "$config_file" 2>/dev/null; then
        write_host_color "gray" "PATH export already exists in $config_file"
    elif [[ -w $config_file ]]; then
        echo -e "\n# map-dev wrapper" >> "$config_file"
        echo "$command" >> "$config_file"
        write_host_color "green" "Added map-dev to PATH in $config_file"
    fi
}

config_file=""
for file in $config_files; do
    if [[ -f $file ]]; then
        config_file=$file
        break
    fi
done

if [[ -n $config_file ]] && [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    case $current_shell in
        fish) add_to_path "$config_file" "fish_add_path $INSTALL_DIR" ;;
        *) add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH" ;;
    esac
fi

write_host_color "cyan" "map-dev registered. Restart your terminal, then run 'map-dev' from any folder."

# 3. BUILD & START
write_step "Starting OpenCode TUI (Dev Mode)..."

# Attempting root dev script first
if bun dev -- "${PASSTHROUGH_ARGS[@]}"; then
    exit 0
else
    write_warning "Root 'dev' script failed. Attempting direct CLI launch..."
    cd packages/opencode && bun dev -- "${PASSTHROUGH_ARGS[@]}"
fi
