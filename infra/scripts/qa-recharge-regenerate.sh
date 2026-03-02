#!/usr/bin/env bash
set -euo pipefail

BFF_URL="${BFF_URL:-http://localhost:8787}"
ACCESS_TOKEN="${ACCESS_TOKEN:-}"
DEVICE_ID="${DEVICE_ID:-}"
RECHARGE_CODE="${RECHARGE_CODE:-}"
SCENARIO="${SCENARIO:-ads_compliance}"
GENERATE_TIMEOUT_SEC="${GENERATE_TIMEOUT_SEC:-45}"
TARGET_REQUIRED_CREDITS="${TARGET_REQUIRED_CREDITS:-10}"

require_var() {
  local key="$1"
  if [ -z "${!key:-}" ]; then
    echo "[error] missing env: $key"
    exit 1
  fi
}

json_get() {
  local key="$1"
  node -e '
const fs = require("fs")
const path = process.argv[1]
const input = fs.readFileSync(0, "utf8")
const obj = JSON.parse(input)
let value = obj
for (const segment of path.split(".")) {
  if (!segment) continue
  value = value?.[segment]
}
if (value === undefined || value === null) process.exit(2)
process.stdout.write(String(value))
' "$key"
}

require_var "ACCESS_TOKEN"
require_var "DEVICE_ID"
require_var "RECHARGE_CODE"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

auth_headers=(
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
  -H "x-device-id: ${DEVICE_ID}"
  -H "Content-Type: application/json"
)

global_context="$(head -c 8200 </dev/zero | tr '\0' 'A')"
generate_payload="$(SCENARIO="${SCENARIO}" GLOBAL_CONTEXT="${global_context}" node -e '
const payload = {
  pageContext: {
    title: "Google Ads Verification",
    description: "Policy review for business verification",
    lang: "en-US",
    url: "https://ads.google.com/"
  },
  fieldContext: {
    label: "Appeal Message",
    placeholder: "Describe why this account should be restored",
    type: "textarea",
    surroundingText: "Upload supporting documents if available."
  },
  scenario: process.env.SCENARIO || "ads_compliance",
  userHint: "Please provide a structured and policy-compliant appeal.",
  mode: "longDoc",
  useGlobalContext: true,
  globalContext: process.env.GLOBAL_CONTEXT || ""
}
process.stdout.write(JSON.stringify(payload))
' )"

echo "[step] fetch usage before recharge"
usage_before="$(curl -fsS "${BFF_URL}/api/usage" -H "Authorization: Bearer ${ACCESS_TOKEN}" -H "x-device-id: ${DEVICE_ID}")"
before_credits="$(printf '%s' "$usage_before" | json_get credits || true)"
if [ -z "${before_credits}" ]; then
  echo "[error] failed to parse usage. response=${usage_before}"
  exit 1
fi
echo "[info] credits_before=${before_credits}"

if [ "${before_credits}" -ge "${TARGET_REQUIRED_CREDITS}" ]; then
  echo "[error] precondition not met: credits_before=${before_credits} >= ${TARGET_REQUIRED_CREDITS}"
  echo "[hint] lower credits first, then rerun this script."
  exit 2
fi

echo "[step] generate once, expect 402 INSUFFICIENT_CREDITS"
status_1="$(
  curl -sS \
    -o "${tmp_dir}/generate_1.out" \
    -w "%{http_code}" \
    -X POST "${BFF_URL}/api/generate" \
    "${auth_headers[@]}" \
    --data "${generate_payload}"
)"
body_1="$(cat "${tmp_dir}/generate_1.out")"

if [ "${status_1}" != "402" ]; then
  echo "[error] expected 402, got ${status_1}"
  echo "[debug] body=${body_1}"
  exit 1
fi

if ! grep -q "INSUFFICIENT_CREDITS" "${tmp_dir}/generate_1.out"; then
  echo "[error] 402 response does not contain INSUFFICIENT_CREDITS"
  echo "[debug] body=${body_1}"
  exit 1
fi

required_credits="$(printf '%s' "$body_1" | json_get requiredCredits || true)"
current_credits="$(printf '%s' "$body_1" | json_get currentCredits || true)"
echo "[info] required_credits=${required_credits:-unknown} current_credits=${current_credits:-unknown}"

echo "[step] redeem recharge code"
redeem_payload="$(printf '{"code":"%s"}' "${RECHARGE_CODE}")"
status_redeem="$(
  curl -sS \
    -o "${tmp_dir}/redeem.out" \
    -w "%{http_code}" \
    -X POST "${BFF_URL}/api/invites/redeem" \
    "${auth_headers[@]}" \
    --data "${redeem_payload}"
)"
body_redeem="$(cat "${tmp_dir}/redeem.out")"
if [ "${status_redeem}" != "200" ]; then
  echo "[error] redeem failed: status=${status_redeem}"
  echo "[debug] body=${body_redeem}"
  exit 1
fi

credits_added="$(printf '%s' "$body_redeem" | json_get creditsAdded || true)"
credits_after_redeem="$(printf '%s' "$body_redeem" | json_get credits || true)"
echo "[info] credits_added=${credits_added:-unknown} credits_after_redeem=${credits_after_redeem:-unknown}"

echo "[step] fetch usage after recharge"
usage_after="$(curl -fsS "${BFF_URL}/api/usage" -H "Authorization: Bearer ${ACCESS_TOKEN}" -H "x-device-id: ${DEVICE_ID}")"
after_credits="$(printf '%s' "$usage_after" | json_get credits || true)"
if [ -z "${after_credits}" ]; then
  echo "[error] failed to parse usage after recharge. response=${usage_after}"
  exit 1
fi
echo "[info] credits_after=${after_credits}"

if [ "${after_credits}" -le "${before_credits}" ]; then
  echo "[error] credits did not increase after redeem"
  exit 1
fi

echo "[step] generate again, expect 200 SSE stream"
status_2="$(
  curl -sS \
    --max-time "${GENERATE_TIMEOUT_SEC}" \
    -o "${tmp_dir}/generate_2.out" \
    -w "%{http_code}" \
    -X POST "${BFF_URL}/api/generate" \
    "${auth_headers[@]}" \
    --data "${generate_payload}"
)"

if [ "${status_2}" != "200" ]; then
  echo "[error] expected second generate status=200, got ${status_2}"
  echo "[debug] body=$(cat "${tmp_dir}/generate_2.out")"
  exit 1
fi

if ! grep -q "^event: meta" "${tmp_dir}/generate_2.out"; then
  echo "[error] second generate response missing SSE meta event"
  echo "[debug] body=$(cat "${tmp_dir}/generate_2.out")"
  exit 1
fi

if grep -q "^event: error" "${tmp_dir}/generate_2.out"; then
  echo "[error] second generate stream returned error event"
  echo "[debug] body=$(cat "${tmp_dir}/generate_2.out")"
  exit 1
fi

echo "[pass] recharge flow verified: INSUFFICIENT_CREDITS -> redeem -> generate success"
