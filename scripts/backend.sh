#!/usr/bin/env bash
# Runs the Sporty Street backend from the sibling folder ../sporty-street for local demos.
#
#   bash scripts/backend.sh start   # database + backend on http://localhost:8080 (Ctrl+C stops the backend)
#   bash scripts/backend.sh reset   # fresh demo data: new rounds, teams, RP (POST /api/v1/dev/reset)
#   bash scripts/backend.sh stop    # stop the database
#   bash scripts/backend.sh status
#
# With Docker installed it uses the backend's own `docker compose up --build`.
# Without Docker: PostgreSQL 16 from Homebrew (data in .dev-data/postgres) + JDK 21 + ./mvnw,
# the backend README's "Development" path with the `local` profile.
set -euo pipefail

FE_DIR=$(cd "$(dirname "$0")/.." && pwd)
BE_DIR=${BACKEND_DIR:-$FE_DIR/../sporty-street}
PG_BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}
PG_DATA=$FE_DIR/.dev-data/postgres
PG_PORT=${PG_PORT:-5432}
# BACKEND_PORT / BACKEND_DB run a second backend side by side (e.g. a new version on 8081, own data).
PORT=${BACKEND_PORT:-8080}
DB=${BACKEND_DB:-sportystreet} DB_USER=sportystreet DB_PASSWORD=sportystreet-demo
API=http://localhost:$PORT

[ -f "$BE_DIR/pom.xml" ] || { echo "Backend not found in $BE_DIR (set BACKEND_DIR=...)"; exit 1; }

# First JDK 21+ with a compiler: $JAVA_HOME, mise (temurin/openjdk), then macOS java_home.
java_home() {
  local candidates=("${JAVA_HOME:-}")
  if command -v mise >/dev/null; then
    for v in temurin-21 java@21 temurin-latest; do candidates+=("$(mise where "java@${v#java@}" 2>/dev/null)"); done
  fi
  candidates+=("$(/usr/libexec/java_home -v 21+ 2>/dev/null)")
  for c in "${candidates[@]}"; do
    [ -n "$c" ] || continue
    [ -x "$c/Contents/Home/bin/javac" ] && c="$c/Contents/Home"
    if [ -x "$c/bin/javac" ] && "$c/bin/java" -version 2>&1 | grep -qE 'version "(2[1-9]|[3-9][0-9])'; then echo "$c"; return; fi
  done
  echo "JDK 21 is required (e.g. 'mise use -g java@temurin-21' or 'brew install openjdk@21')" >&2
  exit 1
}

pg_running() { "$PG_BIN/pg_ctl" -D "$PG_DATA" status >/dev/null 2>&1; }

start_db() {
  [ -x "$PG_BIN/pg_ctl" ] || { echo "PostgreSQL 16 is required: brew install postgresql@16"; exit 1; }
  if [ ! -f "$PG_DATA/PG_VERSION" ]; then
    mkdir -p "$PG_DATA"
    "$PG_BIN/initdb" -D "$PG_DATA" -U postgres --auth=trust --encoding=UTF8 --locale=en_US.UTF-8 >/dev/null
  fi
  if ! pg_running; then
    # Homebrew's PostgreSQL refuses to start on macOS without an explicit locale.
    LC_ALL=en_US.UTF-8 "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_DATA/server.log" -o "-p $PG_PORT -k /tmp" -w start >/dev/null
  fi
  local psql=("$PG_BIN/psql" -h localhost -p "$PG_PORT" -U postgres -v ON_ERROR_STOP=1 -qtA)
  if [ "$("${psql[@]}" -c "select 1 from pg_roles where rolname='$DB_USER'")" != 1 ]; then
    "${psql[@]}" -c "create role $DB_USER login password '$DB_PASSWORD'"
  fi
  if [ "$("${psql[@]}" -c "select 1 from pg_database where datname='$DB'")" != 1 ]; then
    "${psql[@]}" -c "create database $DB owner $DB_USER"
  fi
  echo "PostgreSQL on localhost:$PG_PORT (data: .dev-data/postgres)"
}

case "${1:-start}" in
  start)
    if command -v docker >/dev/null 2>&1; then
      cd "$BE_DIR" && exec docker compose up --build
    fi
    start_db
    export JAVA_HOME
    JAVA_HOME=$(java_home)
    export PATH="$JAVA_HOME/bin:$PATH"
    export DATABASE_URL="jdbc:postgresql://localhost:$PG_PORT/$DB" DATABASE_USER=$DB_USER DATABASE_PASSWORD=$DB_PASSWORD
    echo "Starting the backend (first run downloads Maven dependencies)…"
    cd "$BE_DIR" && exec ./mvnw -q spring-boot:run -Dspring-boot.run.profiles=local -Dspring-boot.run.arguments=--server.port=$PORT
    ;;
  stop)
    if pg_running; then "$PG_BIN/pg_ctl" -D "$PG_DATA" -m fast stop >/dev/null && echo "PostgreSQL stopped"; else echo "PostgreSQL is not running"; fi
    ;;
  reset)
    curl -fsS -X POST -H 'X-Dev-User: alice' "$API/api/v1/dev/reset" && echo
    ;;
  status)
    pg_running && echo "PostgreSQL: running" || echo "PostgreSQL: stopped"
    curl -fsS -m 3 "$API/actuator/health" >/dev/null 2>&1 && echo "Backend: up on $API" || echo "Backend: down"
    ;;
  *)
    echo "usage: bash scripts/backend.sh start|stop|reset|status"; exit 1
    ;;
esac
