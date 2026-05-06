#!/usr/bin/env bash
# Build a multi-architecture Docker image for founder-finance.
#
# Usage:
#   scripts/build-image.sh                        # build linux/amd64 + linux/arm64, load locally
#   scripts/build-image.sh --push ghcr.io/foo/ff  # build + push to a registry
#   IMAGE=foo/founder-finance scripts/build-image.sh --push
#
# Requires Docker Buildx (bundled with modern Docker Desktop / Docker Engine).
set -euo pipefail

IMAGE="${IMAGE:-founder-finance:latest}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
ACTION="--load"   # default: load into local docker
TARGET="$IMAGE"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)
      ACTION="--push"
      if [[ $# -gt 1 && "$2" != --* ]]; then
        TARGET="$2"
        shift
      fi
      shift
      ;;
    --platforms)
      PLATFORMS="$2"
      shift 2
      ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 2
      ;;
  esac
done

# Make sure a multi-arch builder exists.
if ! docker buildx inspect founder-finance-builder >/dev/null 2>&1; then
  echo "Creating buildx builder 'founder-finance-builder'..."
  docker buildx create --name founder-finance-builder --use
else
  docker buildx use founder-finance-builder
fi

# --load only works for a single platform. For multi-arch you must --push.
if [[ "$ACTION" == "--load" && "$PLATFORMS" == *","* ]]; then
  echo "Note: --load can't carry multi-arch images. Building only your host platform locally."
  HOST_ARCH="$(uname -m)"
  case "$HOST_ARCH" in
    arm64|aarch64) PLATFORMS="linux/arm64" ;;
    *)             PLATFORMS="linux/amd64" ;;
  esac
fi

echo "Building $TARGET for $PLATFORMS ($ACTION)"
docker buildx build \
  --platform "$PLATFORMS" \
  -t "$TARGET" \
  "$ACTION" \
  .
