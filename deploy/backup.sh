#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/wise
stamp=$(date -u +%Y%m%dT%H%M%SZ)
recipient=$(tr -d '\r\n' < /opt/wise/backup-recipient.txt)
destination=$(mktemp -d /var/backups/wise/.work.XXXXXX)
# Pause all writers so the SQL dump and media describe the same application state.
docker compose stop api worker
trap 'docker compose start api worker; rm -rf -- "$destination"; rm -f -- "/var/backups/wise/$stamp.tar.gz.age.part"' EXIT
docker compose exec -T postgres pg_dump -U wise_owner -d wise -Fc > "$destination/database.dump"
docker run --rm -v wise_media:/media:ro -v "$destination:/backup" public.ecr.aws/docker/library/postgres:17-alpine tar -czf /backup/media.tar.gz -C /media .
cp .env "$destination/deployment.env"
(cd "$destination"; sha256sum database.dump media.tar.gz deployment.env > SHA256SUMS)
tar -czf - -C "$destination" . | age --encrypt --recipient "$recipient" > "/var/backups/wise/$stamp.tar.gz.age.part"
mv "/var/backups/wise/$stamp.tar.gz.age.part" "/var/backups/wise/$stamp.tar.gz.age"
find /var/backups/wise -maxdepth 1 -type f -name '*.tar.gz.age' -mtime +7 -delete
printf 'Encrypted backup completed: %s\n' "$stamp"
# Keep the decryption key and an exported encrypted archive on a different computer.
