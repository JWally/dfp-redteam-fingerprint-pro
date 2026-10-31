#!/usr/bin/env node
/** fp-al-hook2.mjs — fixed plaintext capture: iterate the Uint32Array values
 *  to bytes (little-endian), capture key + offset, run real agent. */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';
const PUB="bYngJqyRNqwrfbXptlan";
let loader = readFileSync('/tmp/opencode/fp/v4.js','utf-8');
const from = 'function Al(y,G,B){const K=sf(G());';
const to   = 'function Al(y,G,B){const K=sf(G());try{var __d=new Uint32Array(y.buffer,y.byteOffset,y.byteLength/4);var __bytes=[];for(var __i=0;__i<__d.length;__i++){var __v=__d[__i];__bytes.push(__v&255,__v>>8&255,__v>>16&255,__v>>24&255);}(self.__al=self.__al||[]).length<200&&self.__al.push({pt:__bytes,key:Array.from(G||[]).slice(0,64),B:B});}catch(_){}';
loader = loader.replace(from,to);

const srv=http.createServer((req,res)=>{res.setHeader("Content-Type","text/html");res.end("<!doctype html><html><body>FP</body></html>");});
await new Promise(r=>srv.listen(0,"127.0.0.1",r));
const port=srv.address().port;
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
const page=await ctx.newPage();
await page.route(`**/v4/${PUB}`, route => route.fulfill({ status:200, contentType:'application/javascript', body: loader }));
await page.goto(`http://127.0.0.1:${port}/`);
await page.evaluate((pub)=>import(`https://fpjscdn.net/v4/${pub}`).then(m=>m.start({apiKey:pub})).then(a=>a.get()).catch(()=>{}), PUB);
await page.waitForTimeout(12000);
const caps = await page.evaluate(()=>self.__al||[]).catch(()=>[]);
console.log('Al captures:', caps.length);
const big = caps.sort((a,b)=>b.pt.length-a.pt.length);
for (const c of big.slice(0,5)){
  const bytes = c.pt;
  const printable = bytes.filter(x=>x>=32&&x<127).length / Math.max(1,bytes.length);
  let txt=''; try{ txt = new TextDecoder().decode(new Uint8Array(bytes)); }catch(_){}
  console.log(`\n=== pt len ${bytes.length} (${Math.round(printable*100)}% printable) keylen ${c.key.length} B=${c.B} ===`);
  console.log('  bytes head:', bytes.slice(0,120));
  console.log('  ascii head:', txt.slice(0,200).replace(/\n/g,'\\n'));
  if (bytes.length>0) writeFileSync(`/tmp/opencode/fp/al-pt-${bytes.length}.bin`, Buffer.from(bytes));
}
writeFileSync('/tmp/opencode/fp/al-caps2.json', JSON.stringify(caps.map(c=>({ptlen:c.pt.length,keylen:c.key.length,B:c.B,pthead:c.pt.slice(0,300)})),null,1));
srv.close(); await b.close();
