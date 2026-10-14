import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {ROOT} from '../local-config.mjs';
const directory=`${ROOT}/.local/deployment/pilot`;
const {student,executor,fallback}=JSON.parse(readFileSync(`${directory}/deployment.json`));
for(const host of [student,executor,fallback])assert.match(host,/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/);
const {release}=JSON.parse(readFileSync(`${directory}/release.json`));assert.match(release,/^[a-f0-9]{64}$/);
const base=`/opt/majorpilot/releases/${release}`;
const save=(name,value)=>writeFileSync(`${directory}/${name}`,value,{mode:0o600});
const hardening=`Slice=majorpilot.slice
Restart=on-failure
RestartSec=15
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
[Install]
WantedBy=multi-user.target
`;
save('majorpilot-backend.service',`[Unit]
Description=MajorPilot invitation backend (${release.slice(0,12)})
After=network-online.target majorpilot-mysql.service majorpilot-redis.service
Requires=majorpilot-mysql.service majorpilot-redis.service
[Service]
Type=simple
User=majorpilot
Group=majorpilot
WorkingDirectory=/opt/majorpilot/logs/backend
EnvironmentFile=/opt/majorpilot/config/backend.env
ExecStart=/opt/majorpilot/runtime/jre/bin/java -Xms64m -Xmx320m -Xss512k -XX:MaxMetaspaceSize=128m -XX:MaxDirectMemorySize=32m -XX:ReservedCodeCacheSize=64m -XX:ActiveProcessorCount=2 -jar ${base}/app.jar
TimeoutStopSec=60
MemoryMax=640M
ReadWritePaths=/opt/majorpilot/data /opt/majorpilot/logs/backend
${hardening}`);
save('majorpilot-executor.service',`[Unit]
Description=MajorPilot isolated calculator
After=network.target
[Service]
Type=simple
User=majorpilot-exec
Group=majorpilot-exec
EnvironmentFile=/opt/majorpilot/config/executor.env
ExecStart=/opt/majorpilot/runtime/node/bin/node --max-old-space-size=32 ${base}/executor/server.mjs
MemoryMax=80M
${hardening}`);
const acme=`location ^~ /.well-known/acme-challenge/ { root /opt/majorpilot/acme; }`;
save('nginx-http.conf',`# Managed MajorPilot invitation pilot; exact hosts only.
server { listen 80; server_name ${student} ${executor} ${fallback}; ${acme} location / { return 503; } }
`);
const tls=`ssl_certificate /etc/letsencrypt/live/majorpilot-pilot/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/majorpilot-pilot/privkey.pem;
ssl_protocols TLSv1.2 TLSv1.3;
access_log off;
error_log /var/log/nginx/majorpilot-error.log crit;`;
const proxy=`proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-Proto https;
proxy_set_header X-Forwarded-Port 443;
proxy_set_header Forwarded "";
proxy_read_timeout 60s;
proxy_pass http://127.0.0.1:18230;`;
save('nginx-https.conf',`# Managed MajorPilot invitation pilot; exact hosts only.
server { listen 80; server_name ${student} ${executor} ${fallback}; ${acme} location / { return 308 https://$host$request_uri; } }
server {
listen 443 ssl; server_name ${fallback}; ${tls}
return 308 https://${student}$request_uri;
}
server {
listen 443 ssl; server_name ${student}; ${tls}
root ${base}/student;
client_max_body_size 2m;
add_header X-Content-Type-Options nosniff always;
add_header Cache-Control no-store always;
add_header Referrer-Policy no-referrer always;
add_header X-Frame-Options DENY always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; frame-src https://${executor}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
location ^~ /api/public/v1/ { ${proxy} }
location ^~ /api/app/v1/ { ${proxy} }
location /api/ { return 404; }
location ~ /\\. { deny all; }
location / { try_files $uri $uri/ /index.html; }
}
server {
listen 443 ssl; server_name ${executor}; ${tls}
location = / {
proxy_set_header Host ${executor};
proxy_set_header Cookie "";
proxy_set_header Authorization "";
proxy_pass http://127.0.0.1:15230;
}
location / { return 404; }
}
`);
console.log('Private release-specific service and ingress configuration rendered.');
