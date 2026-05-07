#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-wenda}"
DEPLOY_DIR="${DEPLOY_DIR:-/data/${APP_NAME}}"
ARCHIVE_PATH="${1:-${ARCHIVE_PATH:-/tmp/${APP_NAME}-release.tar.gz}}"
PORT="${PORT:-3006}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
APP_URL="${APP_URL:-http://127.0.0.1:${PORT}}"
SQLITE_DB_PATH="${SQLITE_DB_PATH:-${DEPLOY_DIR}/data/${APP_NAME}.sqlite}"
BACKUP_ROOT="${BACKUP_ROOT:-/data/${APP_NAME}-backups}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

info() {
  echo "INFO: $*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令：$1"
}

ensure_safe_deploy_dir() {
  case "${DEPLOY_DIR}" in
    "" | "/" | "/data" | "/data/" | "/tmp" | "/tmp/")
      fail "部署目录过于危险：${DEPLOY_DIR}"
      ;;
  esac
}

backup_data_dir() {
  local data_dir="${DEPLOY_DIR}/data"
  if [[ ! -d "${data_dir}" ]]; then
    info "未发现已有数据库目录，跳过备份：${data_dir}"
    return
  fi

  local backup_dir="${BACKUP_ROOT}/data.$(date +%Y%m%d%H%M%S)"
  mkdir -p "${BACKUP_ROOT}"
  cp -a "${data_dir}" "${backup_dir}"
  info "数据库目录已备份到：${backup_dir}"
}

remove_old_app_files() {
  mkdir -p "${DEPLOY_DIR}"
  info "清理旧程序文件，保留：${DEPLOY_DIR}/data"
  find "${DEPLOY_DIR}" -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} +
}

extract_release() {
  info "解压发布包：${ARCHIVE_PATH}"
  tar -xzf "${ARCHIVE_PATH}" \
    --exclude='./data' \
    --exclude='data' \
    --exclude='data/*' \
    -C "${DEPLOY_DIR}"
}

restart_pm2() {
  local start_script="${DEPLOY_DIR}/start-pm2.sh"
  [[ -f "${start_script}" ]] || fail "发布包缺少启动脚本：${start_script}"

  chmod +x "${start_script}"
  cd "${DEPLOY_DIR}"
  APP_NAME="${APP_NAME}" \
    PORT="${PORT}" \
    HOSTNAME="${HOSTNAME}" \
    SQLITE_DB_PATH="${SQLITE_DB_PATH}" \
    APP_URL="${APP_URL}" \
    "${start_script}"
}

main() {
  ensure_safe_deploy_dir
  require_command tar
  require_command find
  require_command pm2

  [[ -f "${ARCHIVE_PATH}" ]] || fail "发布包不存在：${ARCHIVE_PATH}"

  info "应用名称：${APP_NAME}"
  info "部署目录：${DEPLOY_DIR}"
  info "数据库路径：${SQLITE_DB_PATH}"

  pm2 stop "${APP_NAME}" >/dev/null 2>&1 || true
  backup_data_dir
  remove_old_app_files
  extract_release
  restart_pm2

  info "部署完成，可查看状态：pm2 list && pm2 logs ${APP_NAME}"
}

main "$@"
