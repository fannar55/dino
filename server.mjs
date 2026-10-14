import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);
  }catch{res.writeHead(404);res.end('Fannst ekki');}
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
