#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

landing_file="${ROOT_DIR}/apps/admin/app/landing/page.tsx"
recharge_file="${ROOT_DIR}/apps/admin/app/recharge/page.tsx"
wechat_qr_file="${ROOT_DIR}/apps/admin/public/recharge/wechat-qr-placeholder.svg"
alipay_qr_file="${ROOT_DIR}/apps/admin/public/recharge/alipay-qr-placeholder.svg"
nginx_file="${ROOT_DIR}/infra/nginx/nginx.conf"

require_file() {
  local file="$1"
  if [ ! -f "${file}" ]; then
    echo "[error] required file missing: ${file}"
    exit 1
  fi
}

has_rg=false
if command -v rg >/dev/null 2>&1; then
  has_rg=true
fi

require_match() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if $has_rg; then
    if rg -q "${pattern}" "${file}"; then
      return
    fi
  elif grep -Eq "${pattern}" "${file}"; then
    return
  fi
  {
    echo "[error] ${message}"
    echo "[debug] file=${file} pattern=${pattern}"
    exit 1
  }
}

require_no_match() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if $has_rg; then
    if rg -q "${pattern}" "${file}"; then
      echo "[error] ${message}"
      echo "[debug] file=${file} pattern=${pattern}"
      exit 1
    fi
    return
  fi
  if grep -Eq "${pattern}" "${file}"; then
    echo "[error] ${message}"
    echo "[debug] file=${file} pattern=${pattern}"
    exit 1
  fi
}

require_file "${landing_file}"
require_file "${recharge_file}"
require_file "${wechat_qr_file}"
require_file "${alipay_qr_file}"
require_file "${nginx_file}"

require_match "${landing_file}" 'EXTENSION_STORE_URL' "landing install CTA should use EXTENSION_STORE_URL"
require_match "${landing_file}" 'href="/recharge"' "landing should provide recharge entry"
require_no_match "${landing_file}" 'href="/login"' "landing CTA must not point to /login"

require_match "${recharge_file}" 'NEXT_PUBLIC_SUPPORT_EMAIL' "recharge page should read support email from env"
require_match "${recharge_file}" 'NEXT_PUBLIC_WECHAT_QR_SRC' "recharge page should read WeChat QR path from env"
require_match "${recharge_file}" 'NEXT_PUBLIC_ALIPAY_QR_SRC' "recharge page should read Alipay QR path from env"

require_match "${nginx_file}" 'server_name admin\.formpilot\.ai formpilot\.ai www\.formpilot\.ai;' \
  "nginx should route formpilot.ai and www.formpilot.ai to admin app"

echo "[pass] landing + recharge funnel guards passed"
