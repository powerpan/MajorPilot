import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { mysqlCommand } from '../scripts/infra.mjs';
import { runtimeEnv } from '../scripts/env.mjs';
import { ROOT } from '../scripts/local-config.mjs';

const count = Number(mysqlCommand("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='majorpilot_raw'"));
if (count !== 0 && !process.argv.includes('--resume')) throw new Error('Raw login probe requires a newly empty majorpilot_raw schema; no reset performed');
mysqlCommand("CREATE DATABASE IF NOT EXISTS majorpilot_raw CHARACTER SET utf8mb4; GRANT ALL ON majorpilot_raw.* TO 'majorpilot'@'127.0.0.1';");
if(count===0) mysqlCommand('USE majorpilot_raw;\n' + readFileSync(`${ROOT}/database/baseline/ry_20260417.sql`, 'utf8') + '\n' + readFileSync(`${ROOT}/database/baseline/quartz.sql`, 'utf8'));
mysqlCommand("UPDATE majorpilot_raw.sys_config SET config_value='false' WHERE config_key='sys.account.captchaEnabled';UPDATE majorpilot_raw.sys_user SET status='0' WHERE user_id=1;");
const env = runtimeEnv({ secrets: true });
Object.assign(env, {
  SPRING_DATASOURCE_DRUID_MASTER_URL: env.MP_DB_URL.replace('/majorpilot?', '/majorpilot_raw?'),
  SPRING_DATASOURCE_DRUID_MASTER_USERNAME: env.MP_DB_USERNAME,
  SPRING_DATASOURCE_DRUID_MASTER_PASSWORD: env.MP_DB_PASSWORD,
  SPRING_DATASOURCE_DRUID_STATVIEWSERVLET_ENABLED: 'false',
  SPRING_DATA_REDIS_HOST: '127.0.0.1', SPRING_DATA_REDIS_PORT: '16380',
  SPRING_DATA_REDIS_PASSWORD: env.MP_REDIS_PASSWORD,
  TOKEN_SECRET: env.MP_ADMIN_TOKEN_SECRET,
  SERVER_ADDRESS: '127.0.0.1', SERVER_PORT: '18080',
  RUOYI_PROFILE: `${ROOT}/data/raw-uploads`,
  LOGGING_CONFIG: `${ROOT}/backend/ruoyi-majorpilot/src/test/resources/logback-p0-raw.xml`,
  LOGGING_LEVEL_COM_RUOYI: 'warn',
});
mkdirSync(`${ROOT}/logs`, { recursive: true });
const fd = openSync(`${ROOT}/logs/p0-raw-backend.log`, 'a', 0o600);
const java = spawn('/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/java', [`-Dlogback.configurationFile=${env.LOGGING_CONFIG}`, '-jar', '/tmp/majorpilot-ruoyi-original.jar'], { cwd: ROOT, env, stdio: ['ignore', fd, fd] });
try {
  let ready = false;
  for (let i=0;i<120;i++) {
    if (java.exitCode !== null) throw new Error('Raw backend exited; inspect local raw log');
    try { const res = await fetch('http://127.0.0.1:18080/captchaImage'); if (res.ok) { ready=true;break; } } catch {}
    await new Promise(r=>setTimeout(r,500));
  }
  if(!ready) throw new Error('Raw backend readiness timed out');
  const response=await fetch('http://127.0.0.1:18080/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123',code:'',uuid:''})});
  const result=await response.json();
  if(result.code!==200 || typeof result.token!=='string') throw new Error('Raw upstream login failed; credentials suppressed');
  const info=await fetch('http://127.0.0.1:18080/getInfo',{headers:{Authorization:`Bearer ${result.token}`}});
  const details=await info.json();
  if(details.code!==200 || details.user?.userName!=='admin') throw new Error('Raw upstream getInfo failed');
  await fetch('http://127.0.0.1:18080/logout',{method:'POST',headers:{Authorization:`Bearer ${result.token}`}});
  console.log(JSON.stringify({scope:'unchanged-upstream-jar-with-external-local-config',login:'PASS',getInfo:'PASS',version:'3.9.2'}));
} finally {
  java.kill('SIGTERM'); await new Promise(resolve=>{java.once('exit',resolve);setTimeout(resolve,5000)}); if(java.exitCode===null) java.kill('SIGKILL');closeSync(fd);
  mysqlCommand("UPDATE majorpilot_raw.sys_user SET status='1';");
}
