#!/usr/bin/env bash
# Root-only, exact dedicated database. Seven daily local restore points.
set -euo pipefail
umask 077
[[ $EUID == 0 && $(</opt/majorpilot/.managed) == majorpilot-invitation-pilot-v1 ]] || exit 1
stamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="/opt/majorpilot/backups/pilot-${stamp}.sql.gz"
[[ ! -e "$destination" ]] || exit 1
/opt/majorpilot/runtime/mysql/bin/mysqldump --defaults-file=/opt/majorpilot/config/mysql-admin.cnf --single-transaction --no-tablespaces --set-gtid-purged=OFF --routines=false --triggers majorpilot_pilot | gzip > "${destination}.partial"
gzip -t "${destination}.partial"
mv "${destination}.partial" "$destination"
sha256sum "$destination" > "${destination}.sha256"
# Fixed root-owned directory; only this tool's dated backup files are eligible.
find /opt/majorpilot/backups -maxdepth 1 -type f -name 'pilot-????????T??????Z.sql.gz*' -mtime +7 -delete
echo 'MajorPilot backup completed.'
