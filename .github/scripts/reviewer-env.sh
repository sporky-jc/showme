#!/usr/bin/env bash
# Prints the AI reviewer's .env lines, for the deploy workflows to add to
# backend/.env. Reads (from GitHub secrets and variables, passed in by the
# workflow):
#
#   CLOUDFLARE_ACCOUNT_ID   secret: the Cloudflare account's id
#   CLOUDFLARE_AI_TOKEN     secret: an API token with only "Workers AI" access
#   GROQ_API_KEY            secret, optional: only used with REVIEWER_USE_GROQ
#   REVIEWER_MODE           variable: "off" (the default) or "suggest"
#   OWNER_EMAIL             secret: the email of the site's owner, who sees
#                           the Owner settings on the Teacher page (turning
#                           the sense tagger on and off); nobody when unset
#   REVIEWER_USE_GROQ       variable, optional: "yes" to add Groq (13+ only)
#   CLOUDFLARE_REVIEW_MODEL variable, optional: another Workers AI model to
#                           review with (e.g. @cf/meta/llama-3.1-8b-instruct-fast)
#
# Any of them missing just leaves the reviewer off or without that provider;
# a deploy never fails for it. A value in the wrong shape is left out with a
# warning: every value goes in a double-quoted .env line, so nothing with a
# quote, $, space or line break is ever written. Values are never printed to
# the log.
set -euo pipefail

line() { echo "$1=\"$2\""; }

mode="${REVIEWER_MODE:-off}"
if [[ "$mode" =~ ^(off|suggest)$ ]]; then
  line REVIEWER_MODE "$mode"
else
  echo "::warning::REVIEWER_MODE must be off or suggest; the reviewer stays off" >&2
  line REVIEWER_MODE off
fi

if [ -n "${OWNER_EMAIL:-}" ]; then
  if [[ "$OWNER_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
    line OWNER_EMAIL "$OWNER_EMAIL"
  else
    echo "::warning::OWNER_EMAIL doesn't look like an email; nobody sees the Owner settings" >&2
  fi
fi
if [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || [ -n "${CLOUDFLARE_AI_TOKEN:-}" ]; then
  if [[ "${CLOUDFLARE_ACCOUNT_ID:-}" =~ ^[0-9a-f]{32}$ ]] && [[ "${CLOUDFLARE_AI_TOKEN:-}" =~ ^[A-Za-z0-9_-]{20,200}$ ]]; then
    line CLOUDFLARE_ACCOUNT_ID "$CLOUDFLARE_ACCOUNT_ID"
    line CLOUDFLARE_AI_TOKEN "$CLOUDFLARE_AI_TOKEN"
  else
    echo "::warning::CLOUDFLARE_ACCOUNT_ID (32 letters 0-9 a-f) or CLOUDFLARE_AI_TOKEN isn't in the expected shape; Cloudflare is left out" >&2
  fi
fi

if [ -n "${CLOUDFLARE_REVIEW_MODEL:-}" ]; then
  if [[ "$CLOUDFLARE_REVIEW_MODEL" =~ ^@cf/[a-z0-9._-]+/[a-z0-9._-]+$ ]]; then
    line CLOUDFLARE_REVIEW_MODEL "$CLOUDFLARE_REVIEW_MODEL"
  else
    echo "::warning::CLOUDFLARE_REVIEW_MODEL must look like @cf/meta/llama-3.1-8b-instruct-fast; the default model is used" >&2
  fi
fi

if [ "${REVIEWER_USE_GROQ:-}" = "yes" ]; then
  if [[ "${GROQ_API_KEY:-}" =~ ^gsk_[A-Za-z0-9]{20,200}$ ]]; then
    line REVIEWER_USE_GROQ yes
    line GROQ_API_KEY "$GROQ_API_KEY"
  else
    echo "::warning::REVIEWER_USE_GROQ is yes but GROQ_API_KEY is missing or not in the expected shape (gsk_...); Groq is left out" >&2
  fi
fi
