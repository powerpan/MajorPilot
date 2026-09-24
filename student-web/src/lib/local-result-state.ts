type LocalCheck = {stepKey:string;assistance:boolean;result?:{original?:unknown}};
const canonical = (value:unknown):unknown => Array.isArray(value) ? value.map(canonical) : value!==null&&typeof value==='object'
  ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])) : value;
/** Reading guidance only: the backend still verifies the original answer hash. */
export function currentLocalResult<T extends LocalCheck>(records:readonly T[],stepKey:string,local:unknown):T|undefined {
  if(local===undefined||local===null)return undefined;
  const value=JSON.stringify(canonical(local));
  return [...records].reverse().find(record=>record.stepKey===stepKey&&!record.assistance&&record.result?.original!==undefined&&JSON.stringify(canonical(record.result.original))===value);
}
