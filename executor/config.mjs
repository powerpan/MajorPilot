export function executorConfig(env = process.env) {
  if(env.MP_EXECUTOR_MODE !== 'pilot') {
    if(env.MP_EXECUTOR_MODE && env.MP_EXECUTOR_MODE !== 'local') throw new Error('Unknown executor mode');
    return {host:'127.0.0.1',port:15175,parentOrigin:'http://localhost:15173',requestHost:'127.0.0.1:15175'};
  }
  function origin(value) {
    const u=new URL(value);
    if(u.protocol!=='https:'||!u.hostname.includes('.')||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||u.origin!==value) throw new Error('Exact HTTPS executor origins required');
    return u;
  }
  const parent=origin(env.MP_STUDENT_ORIGIN),executor=origin(env.MP_EXECUTOR_ORIGIN);
  if(parent.hostname===executor.hostname)throw new Error('Executor must have a different hostname');
  return {host:'127.0.0.1',port:15230,parentOrigin:parent.origin,requestHost:executor.host};
}
