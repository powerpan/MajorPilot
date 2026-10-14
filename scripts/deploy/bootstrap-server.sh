#!/usr/bin/env bash
# Fresh dedicated runtime only; intentionally refuses upgrades or shared resources.
set -euo pipefail
umask 077
[[ $EUID == 0 && $# == 1 && $1 =~ ^/tmp/majorpilot-bootstrap-[A-Za-z0-9]+$ ]] || exit 1
payload=$1
[[ -d "$payload" && ! -L "$payload" && ! -e /opt/majorpilot ]] || { echo 'Fresh project directory required'; exit 1; }
for name in majorpilot majorpilot-db majorpilot-redis majorpilot-exec; do
  if getent passwd "$name" >/dev/null; then echo 'Project user already exists'; exit 1; fi
done
if ss -lntH | awk '{print $4}' | grep -Eq ':(13360|16390|18230|15230)$'; then echo 'Project ports occupied'; exit 1; fi
cd "$payload"
sha256sum --check runtime.sha256
mkdir -p /opt/majorpilot/{runtime,config,data,run,logs,releases,acme,backups}
printf '%s\n' 'majorpilot-invitation-pilot-v1' > /opt/majorpilot/.managed
chmod 755 /opt/majorpilot /opt/majorpilot/runtime /opt/majorpilot/releases /opt/majorpilot/acme
for name in majorpilot majorpilot-db majorpilot-redis majorpilot-exec; do useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin "$name"; done
for name in jre node mysql redis-source; do mkdir "/opt/majorpilot/runtime/$name"; done
tar -xf temurin-jre21.tar.gz -C /opt/majorpilot/runtime/jre --strip-components=1
tar -xf node-v24.21.0-linux-x64.tar.xz -C /opt/majorpilot/runtime/node --strip-components=1
tar -xf mysql-8.4.11-linux.tar.xz -C /opt/majorpilot/runtime/mysql --strip-components=1
tar -xf redis-7.2.16.tar.gz -C /opt/majorpilot/runtime/redis-source --strip-components=1
make -C /opt/majorpilot/runtime/redis-source -j1 MALLOC=libc BUILD_TLS=no > /opt/majorpilot/logs/redis-build.log 2>&1
mkdir /opt/majorpilot/runtime/redis
install -m 755 /opt/majorpilot/runtime/redis-source/src/redis-server /opt/majorpilot/runtime/redis/
chmod -R a+rX /opt/majorpilot/runtime/{jre,node,mysql,redis}
chown majorpilot:majorpilot /opt/majorpilot/data /opt/majorpilot/logs
chmod 711 /opt/majorpilot/data /opt/majorpilot/run /opt/majorpilot/logs
install -d -m 700 -o majorpilot-db -g majorpilot-db /opt/majorpilot/data/mysql /opt/majorpilot/run/mysql /opt/majorpilot/logs/mysql
install -d -m 700 -o majorpilot-redis -g majorpilot-redis /opt/majorpilot/data/redis
install -d -m 700 -o majorpilot -g majorpilot /opt/majorpilot/data/private-exports /opt/majorpilot/data/uploads /opt/majorpilot/logs/backend
install -m 600 backend.env executor.env mysql-admin.cnf hosts.env /opt/majorpilot/config/
install -m 640 -g majorpilot-redis redis.conf /opt/majorpilot/config/redis.conf
chmod 711 /opt/majorpilot/config
install -m 644 "$payload/mysql.cnf" /opt/majorpilot/config/mysql.cnf
for name in majorpilot.slice majorpilot-mysql.service majorpilot-redis.service; do
  [[ ! -e "/etc/systemd/system/$name" ]] || exit 1
  install -m 644 "$payload/$name" "/etc/systemd/system/$name"
done
runuser -u majorpilot-db -- /opt/majorpilot/runtime/mysql/bin/mysqld --defaults-file=/opt/majorpilot/config/mysql.cnf --initialize-insecure
systemctl daemon-reload
systemctl start majorpilot-mysql.service
for i in {1..60}; do [[ -S /opt/majorpilot/run/mysql/mysql.sock ]] && break; sleep 1; done
/opt/majorpilot/runtime/mysql/bin/mysql --no-defaults --socket=/opt/majorpilot/run/mysql/mysql.sock -uroot < "$payload/initialize.sql"
systemctl enable majorpilot-mysql.service majorpilot-redis.service >/dev/null
systemctl start majorpilot-redis.service
systemctl is-active majorpilot-mysql.service majorpilot-redis.service
echo 'Dedicated infrastructure ready; application and public ingress not started.'
