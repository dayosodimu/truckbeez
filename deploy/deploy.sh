#!/usr/bin/env bash
# Deploy one immutable API image to one environment, with automatic rollback.
#
# Usage: deploy/deploy.sh <staging|preprod|prod> <image@sha256:digest>
#
# Run on the environment's Docker host from the repo's deploy/ directory parent
# (CI copies deploy/ to the host and calls this over SSH).
set -euo pipefail

ENVIRONMENT="${1:?usage: deploy.sh <staging|preprod|prod> <image-ref>}"
IMAGE="${2:?usage: deploy.sh <staging|preprod|prod> <image-ref>}"

cd "$(dirname "$0")"

case "$ENVIRONMENT" in
  staging|preprod) FILES=(-f compose.base.yaml -f compose.data.yaml -f "compose.${ENVIRONMENT}.yaml") ;;
  prod)            FILES=(-f compose.base.yaml -f compose.prod.yaml) ;;
  *) echo "Unknown environment: $ENVIRONMENT" >&2; exit 2 ;;
esac

# Only digest-pinned images may reach preprod and prod.
if [[ "$ENVIRONMENT" != "staging" && "$IMAGE" != *@sha256:* ]]; then
  echo "Refusing to deploy a mutable tag to $ENVIRONMENT: $IMAGE" >&2
  exit 2
fi

export ENV_FILE="env/${ENVIRONMENT}.env"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 2; }
# The env file is passed to compose with --env-file (for ${VAR} interpolation
# such as EDGE_PORT / POSTGRES_PASSWORD) rather than shell-sourced, so values
# containing URL characters like & ? < > are safe.
EDGE_PORT="$(grep -E '^EDGE_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"

PROJECT="truckbeez-${ENVIRONMENT}"
STATE_FILE=".last-good-image.${ENVIRONMENT}"
PREVIOUS_IMAGE="$(cat "$STATE_FILE" 2>/dev/null || true)"
EDGE_URL="http://127.0.0.1:${EDGE_PORT:-8080}"

compose() { API_IMAGE="$1" docker compose --env-file "$ENV_FILE" -p "$PROJECT" "${FILES[@]}" "${@:2}"; }

echo "==> [$ENVIRONMENT] deploying $IMAGE (previous: ${PREVIOUS_IMAGE:-none})"
compose "$IMAGE" pull api

# TODO(TB-xxx): run DB migrations here as a separate one-off container, e.g.
#   compose "$IMAGE" run --rm api node dist/migrate.js
# Migrations must be backward compatible with the previous image so rollback stays safe.

if compose "$IMAGE" up -d --remove-orphans --wait --wait-timeout 120; then
  # Confirm the edge is serving and the expected build answered.
  if curl -fsS "$EDGE_URL/healthz" >/dev/null && curl -fsS "$EDGE_URL/version"; then
    echo
    echo "$IMAGE" > "$STATE_FILE"
    echo "==> [$ENVIRONMENT] deploy OK"
    exit 0
  fi
fi

echo "==> [$ENVIRONMENT] deploy FAILED" >&2
compose "$IMAGE" logs --tail 100 api >&2 || true
if [[ -n "$PREVIOUS_IMAGE" ]]; then
  echo "==> [$ENVIRONMENT] rolling back to $PREVIOUS_IMAGE" >&2
  compose "$PREVIOUS_IMAGE" up -d --remove-orphans --wait --wait-timeout 120
fi
exit 1
