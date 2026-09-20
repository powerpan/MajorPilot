import {createRequire} from 'node:module';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const require = createRequire(new URL('../student-web/package.json', import.meta.url));
const {build} = require('esbuild');
const result = await build({absWorkingDir:new URL('../',import.meta.url).pathname,entryPoints:[new URL('./classifier-worker-entry.mjs',import.meta.url).pathname],bundle:true,format:'iife',platform:'browser',target:'es2022',write:false,minify:false,legalComments:'none'});
const output = result.outputFiles[0].text;
const destination = new URL('./dist/classifier-worker.js',import.meta.url);
if (process.argv.includes('--write')) {mkdirSync(new URL('./dist/',import.meta.url),{recursive:true});writeFileSync(destination,output);}
else if (readFileSync(destination,'utf8') !== output) throw new Error('Classifier bundle differs from reviewed source. Rebuild and review its manifest hash.');
console.log(`Classifier worker SHA256 ${createHash('sha256').update(output).digest('hex')}`);
