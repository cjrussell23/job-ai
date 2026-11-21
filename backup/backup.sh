#!/usr/bin/env bash
# Nightly encrypted Postgres backup.
#   backup.sh schedule   run once a day at BACKUP_TIME (default 03:00, in TZ)
#   backup.sh once       run one backup now
# Needs DATABASE_URL, BACKUP_PASSPHRASE and a writable BACKUP_DIR (default /backups).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_TIME="${BACKUP_TIME:-03:00}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"

log() { printf '%s backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

# Records the outcome where the admin dashboard can read it. Failing to record
# must not hide the backup's own result, so errors here are only logged.
record() {
  local ok="$1" size="$2" file="$3" message="$4" started="$5"
  # Variables are passed with -v and quoted by psql (:'name'), which only works on stdin.
  if ! psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 \
    -v ok="$ok" -v size="$size" -v file="$file" -v message="$message" -v started="$started" <<'SQL'
insert into backup_runs (started_at, finished_at, ok, size_bytes, filename, message)
values (to_timestamp(:'started'), now(), :'ok', :'size', :'file', :'message');
SQL
  then
    log "could not record the result in the database"
  fi
}

run_once() {
  local started name tmp size
  started="$(date +%s)"
  name="jobai-$(date -u +%Y%m%d-%H%M%S).dump.enc"
  tmp="$BACKUP_DIR/.${name}.partial"
  mkdir -p "$BACKUP_DIR"

  # Custom format (-Fc) so pg_restore can restore into an empty database.
  if pg_dump --format=custom --no-owner "$DATABASE_URL" \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$tmp" \
    && [ -s "$tmp" ]; then
    mv "$tmp" "$BACKUP_DIR/$name"
    size="$(wc -c < "$BACKUP_DIR/$name" | tr -d ' ')"
    find "$BACKUP_DIR" -name 'jobai-*.dump.enc' -type f -mtime +"$KEEP_DAYS" -delete
    log "wrote $name ($size bytes)"
    record true "$size" "$name" "ok" "$started"
  else
    rm -f "$tmp"
    log "FAILED"
    record false 0 "" "pg_dump or encryption failed; see the backup container's logs" "$started"
    return 1
  fi
}

seconds_until_next_run() {
  local now target
  now="$(date +%s)"
  target="$(date -d "today $BACKUP_TIME" +%s)"
  if [ "$target" -le "$now" ]; then target="$(date -d "tomorrow $BACKUP_TIME" +%s)"; fi
  echo $((target - now))
}

case "${1:-schedule}" in
  once)
    run_once
    ;;
  schedule)
    log "scheduled daily at $BACKUP_TIME ($(date +%Z)), keeping $KEEP_DAYS days"
    while true; do
      sleep "$(seconds_until_next_run)"
      run_once || true
    done
    ;;
  *)
    echo "usage: backup.sh [schedule|once]" >&2
    exit 2
    ;;
esac
