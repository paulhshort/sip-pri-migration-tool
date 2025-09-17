#!/bin/sh
set -e

# Ensure required directories exist
mkdir -p /app/data/output /app/logs

# Attempt to align permissions so the non-root user can write, even with bind/named volumes
# UID:GID for nextjs user created in Dockerfile is 1001:1001
chown -R 1001:1001 /app/data/output /app/logs 2>/dev/null || true

# Drop privileges and exec the given command
exec su-exec nextjs:nodejs "$@"

