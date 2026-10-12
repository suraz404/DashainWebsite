#!/usr/bin/env bash
# Docker-free alternative to docker-compose.yml: a private Postgres cluster inside ./.pgdata
# on port 5544 (same URL as the Docker setup). Needs PostgreSQL server binaries (macOS installer or Homebrew).
#   scripts/local-postgres.sh start | stop | status
set -euo pipefail
cd "$(dirname "$0")/.."

BIN="${PG_BIN:-}"
if [ -z "$BIN" ]; then
  for d in /Library/PostgreSQL/*/bin /opt/homebrew/opt/postgresql@*/bin /usr/lib/postgresql/*/bin; do
    [ -x "$d/pg_ctl" ] && BIN="$d"
  done
fi
[ -n "$BIN" ] || { echo "PostgreSQL binaries not found. Set PG_BIN=/path/to/bin or use Docker instead." >&2; exit 1; }

# Postgres refuses to start with an invalid locale (common in IDE terminals).
if [ "$(uname)" = "Darwin" ]; then export LC_ALL=en_US.UTF-8; else export LC_ALL=C.UTF-8; fi
export LANG="$LC_ALL"

DATA="$PWD/.pgdata"
PORT=5544

case "${1:-}" in
  start)
    if [ ! -d "$DATA" ]; then
      echo "csitan" > .pgpass.tmp
      "$BIN/initdb" -D "$DATA" -U csitan --auth=scram-sha-256 --pwfile=.pgpass.tmp --locale=C --encoding=UTF8 >/dev/null
      rm -f .pgpass.tmp
    fi
    "$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories=$DATA" -l "$DATA/server.log" -w start
    export PGPASSWORD=csitan
    for db in csitan_dashain csitan_test csitan_e2e; do
      "$BIN/psql" -h localhost -p $PORT -U csitan -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
        || "$BIN/psql" -h localhost -p $PORT -U csitan -d postgres -c "CREATE DATABASE $db" >/dev/null
    done
    echo "Postgres ready on localhost:$PORT (databases: csitan_dashain, csitan_test, csitan_e2e)"
    ;;
  stop) "$BIN/pg_ctl" -D "$DATA" -m fast stop ;;
  status) "$BIN/pg_ctl" -D "$DATA" status ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 2 ;;
esac
