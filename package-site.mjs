import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createServiceWorkerSource} from './scripts/service-worker-source.mjs';
const root=path.resolve('dist');
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
const files=(await walk(root)).filter(f=>!f.endsWith(path.sep+'sw.js')).sort();
const hash=createHash('sha256');
// Worker behavior is part of the revision even when release assets are unchanged.
hash.update(createServiceWorkerSource('revision', []));
for(const f of files){hash.update(path.relative(root,f));hash.update(await readFile(f));}
const revision=hash.digest('hex').slice(0,12);
const paths=files.map(f=>'./'+path.relative(root,f).replaceAll('\\','/'));
const sw=createServiceWorkerSource(revision, paths);
await writeFile(path.join(root,'sw.js'),sw,'utf8');
let bytes=0;for(const f of files)bytes+=(await stat(f)).size;
console.log(JSON.stringify({revision,files:files.length+1,bytes,staticDirectory:root}));
