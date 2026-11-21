# Backups

The `backup` service in the `job-ai` stack (`docker-compose.yml`) writes an encrypted `pg_dump` every night at `BACKUP_TIME` (03:00 Calgary time by default) to `BACKUP_DIR`, and deletes dumps older than 30 days. Each attempt is recorded in the `backup_runs` table, and the admin dashboard shows the latest result. It turns red if no backup has succeeded in the last 26 hours.

Backups stay on the same server, on a different drive from the database. That protects against the database's drive failing, not against losing the whole server. Copy `BACKUP_DIR` off the server if that risk matters.

## Setup

In the `job-ai` stack's environment variables in Portainer:

- `BACKUP_PASSPHRASE`: a long random passphrase (`openssl rand -base64 32`). **Store it somewhere other than the server, such as a password manager.** Without it the dumps cannot be decrypted.
- `BACKUP_DIR`: a directory on a different drive from the Docker volume holding Postgres.

## Take a backup now

```bash
docker exec job-ai-backup-1 backup.sh once
```

## Restore

Restoring replaces the data in the target database. Stop the app first so nothing writes during the restore.

1. Stop the web app and worker:

   ```bash
   docker stop job-ai-web job-ai-worker-1
   ```

2. Pick a dump from `BACKUP_DIR` (names are `jobai-YYYYMMDD-HHMMSS.dump.enc`, in UTC). Decrypt it with the backup image, which has `openssl`, and pipe it into `pg_restore` in the running Postgres:

   ```bash
   export BACKUP_PASSPHRASE='the passphrase'
   docker exec -i -e BACKUP_PASSPHRASE job-ai-backup-1 sh -c \
     'openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE' \
     < /path/to/backups/jobai-YYYYMMDD-HHMMSS.dump.enc \
     | docker exec -i job-ai-postgres-1 pg_restore --clean --if-exists --no-owner -U jobai -d jobai
   ```

3. Start the app again; migrations run on start:

   ```bash
   docker start job-ai-web job-ai-worker-1
   ```

## Checking a backup without touching the live database

Restore into a scratch database and look around:

```bash
docker exec job-ai-postgres-1 createdb -U jobai restore_check
# run the restore command above with -d restore_check instead of -d jobai
docker exec job-ai-postgres-1 psql -U jobai -d restore_check -c 'select count(*) from members'
docker exec job-ai-postgres-1 dropdb -U jobai restore_check
```
