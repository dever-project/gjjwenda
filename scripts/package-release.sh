#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${1:-wenda}"
RELEASE_ROOT="${RELEASE_ROOT:-release}"
ARCHIVE_NAME="${ARCHIVE_NAME:-${APP_NAME}-release.tar.gz}"
SKIP_BUILD="${SKIP_BUILD:-0}"
INCLUDE_DB="${INCLUDE_DB:-0}"
DB_SOURCE="${DB_SOURCE:-${SQLITE_DB_PATH:-data/gjj.sqlite}}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${PROJECT_ROOT}/${RELEASE_ROOT}/${APP_NAME}"
ARCHIVE_PATH="${PROJECT_ROOT}/${ARCHIVE_NAME}"
DEPLOY_SCRIPT_PATH="${PROJECT_ROOT}/${APP_NAME}-deploy-restart.sh"

if [[ "${DB_SOURCE}" != /* ]]; then
  DB_SOURCE="${PROJECT_ROOT}/${DB_SOURCE}"
fi

cd "${PROJECT_ROOT}"

if [[ "${SKIP_BUILD}" != "1" ]]; then
  npm run build
fi

if [[ ! -f ".next/standalone/server.js" ]]; then
  echo "ERROR: .next/standalone/server.js 不存在，请确认 next.config.ts 启用了 output: 'standalone' 并已成功构建。" >&2
  exit 1
fi

if [[ ! -d ".next/static" ]]; then
  echo "ERROR: .next/static 不存在，请先成功执行 npm run build。" >&2
  exit 1
fi

rm -rf "${APP_DIR}" "${ARCHIVE_PATH}" "${DEPLOY_SCRIPT_PATH}"
mkdir -p "${APP_DIR}"

# 明确复制 standalone 的隐藏 .next 目录，避免 shell/cp 对隐藏目录处理不一致。
cp -R ".next/standalone/server.js" "${APP_DIR}/server.js"
cp -R ".next/standalone/package.json" "${APP_DIR}/package.json"
cp -R ".next/standalone/node_modules" "${APP_DIR}/node_modules"
cp -R ".next/standalone/.next" "${APP_DIR}/.next"

rm -rf "${APP_DIR}/.next/static"
cp -R ".next/static" "${APP_DIR}/.next/static"

if [[ -d "public" ]]; then
  cp -R "public" "${APP_DIR}/public"
fi

if [[ "${INCLUDE_DB}" == "1" ]]; then
  if [[ ! -f "${DB_SOURCE}" ]]; then
    echo "ERROR: 数据库文件不存在：${DB_SOURCE}" >&2
    echo "可通过 DB_SOURCE=/path/to/source.sqlite 指定源数据库，或 INCLUDE_DB=0 跳过数据库打包。" >&2
    exit 1
  fi

  mkdir -p "${APP_DIR}/data"
  cp "${DB_SOURCE}" "${APP_DIR}/data/${APP_NAME}.sqlite"
  if [[ -f "${DB_SOURCE}-wal" ]]; then
    cp "${DB_SOURCE}-wal" "${APP_DIR}/data/${APP_NAME}.sqlite-wal"
  fi
  if [[ -f "${DB_SOURCE}-shm" ]]; then
    cp "${DB_SOURCE}-shm" "${APP_DIR}/data/${APP_NAME}.sqlite-shm"
  fi
else
  echo "INFO: 本次发布包不包含数据库。如需首次初始化数据库，请使用 INCLUDE_DB=1。"
fi

if [[ ! -f "${APP_DIR}/.next/BUILD_ID" || ! -d "${APP_DIR}/.next/server" ]]; then
  echo "ERROR: 发布目录缺少 .next/BUILD_ID 或 .next/server，不能启动。" >&2
  exit 1
fi

cat > "${APP_DIR}/start-pm2.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail

cd "\$(dirname "\$0")"

APP_NAME="\${APP_NAME:-${APP_NAME}}"
PORT="\${PORT:-3006}"
HOSTNAME="\${HOSTNAME:-0.0.0.0}"
SQLITE_DB_PATH="\${SQLITE_DB_PATH:-\$(pwd)/data/${APP_NAME}.sqlite}"
APP_URL="\${APP_URL:-http://127.0.0.1:\${PORT}}"

pm2 delete "\${APP_NAME}" >/dev/null 2>&1 || true
HOSTNAME="\${HOSTNAME}" PORT="\${PORT}" SQLITE_DB_PATH="\${SQLITE_DB_PATH}" APP_URL="\${APP_URL}" \\
  pm2 start "\$(pwd)/server.js" --name "\${APP_NAME}" --cwd "\$(pwd)"
EOF
chmod +x "${APP_DIR}/start-pm2.sh"

cp "scripts/deploy-restart.sh" "${DEPLOY_SCRIPT_PATH}"
chmod +x "${DEPLOY_SCRIPT_PATH}"

tar -czf "${ARCHIVE_PATH}" -C "${APP_DIR}" .

cat <<EOF
发布包已生成：
  ${ARCHIVE_PATH}
部署脚本已生成：
  ${DEPLOY_SCRIPT_PATH}

服务器一键部署并重启示例（保留线上数据库目录 /data/${APP_NAME}/data）：
  scp ${ARCHIVE_NAME} ${APP_NAME}-deploy-restart.sh root@服务器IP:/tmp/
  ssh root@服务器IP
  APP_URL=http://服务器IP:3006 bash /tmp/${APP_NAME}-deploy-restart.sh /tmp/${ARCHIVE_NAME}

手动解压示例（保留线上数据库目录 /data/${APP_NAME}/data）：
  mkdir -p /data/${APP_NAME}
  find /data/${APP_NAME} -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} +
  tar -xzf ${ARCHIVE_NAME} --exclude='./data' --exclude='data' --exclude='data/*' -C /data/${APP_NAME}

PM2 启动示例：
  cd /data/${APP_NAME}
  APP_URL=http://服务器IP:3006 ./start-pm2.sh

手动 PM2 启动示例：
  cd /data/${APP_NAME}
  HOSTNAME=0.0.0.0 PORT=3006 SQLITE_DB_PATH=/data/${APP_NAME}/data/${APP_NAME}.sqlite APP_URL=http://服务器IP:3006 pm2 start /data/${APP_NAME}/server.js --name ${APP_NAME} --cwd /data/${APP_NAME}

首次部署如需随包带初始化数据库：
  INCLUDE_DB=1 ./scripts/package-release.sh ${APP_NAME}

日常发版默认不带数据库：
  ./scripts/package-release.sh ${APP_NAME}
EOF
