#!/usr/bin/env node
/** fp-al-hook.mjs — serve a PATCHED v4.js that wraps the Al() encryptor to
 *  capture the PLAINTEXT signal payload + key before encryption. */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';
const PUB="bYngJqyRNqwrfbXptlan";

let loader = readFileSync('/tmp/opencode/fp/v4.js','utf-8');
// wrap Al: capture plaintext (y is Uint32Array -> convert to bytes), key G, offset B
const from = 'function Al(y,G,B){const K=sf(G());';
const to   = 'function Al(y,G,B){const K=sf(G());try{var __pt=new Uint8Array(y.buffer,y.byteOffset,y.byteLength);(self.__al=self.__al||[]).length<200&&self.__al.push({pt:Array.from(__pt).slice(0,5000),key:Array.from(G||[]).slice(0,64),B:B});}catch(_){}';
if (loader.includes(from)) { loader = loader.replace(from,to); console.log('Al wrapped'); }
else console.log('Al PATCH MISS');

const srv=http.createServer((req,res)=>{res.setHeader("Content-Type","text/html");res.end("<!doctype html><html><body>FP</body></html>");});
await new Promise(r=>srv.listen(0,"127.0.0.1",r));
const port=srv.address().port;
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
const page=await ctx.newPage();
// serve patched loader at the real URL
await page.route(`**/v4/${PUB}`, route => route.fulfill({ status:200, contentType:'application/javascript', body: loader }));
// real API (authorized own key) — but the API key check happens server-side; let it hit real API
await page.goto(`http://127.0.0.1:${port}/`);
await page.evaluate((pub)=>import(`https://fpjscdn.net/v4/${pub}`).then(m=>m.start({apiKey:pub})).then(a=>a.get()).catch(()=>{}), PUB);
await page.waitForTimeout(12000);
const caps = await page.evaluate(()=>self.__al||[]).catch(()=>[]);
console.log('Al captures:', caps.length);
const big = caps.sort((a,b)=>b.pt.length-a.pt.length);
for (const c of big.slice(0,4)){
  const bytes = new Uint8Array(c.pt);
  // try utf8 decode
  let txt=''; try{ txt = new TextDecoder().decode(bytes); }catch(_){}
  const printable = [...bytes].filter(x=>x>=32&&x<127).length / bytes.length;
  console.log(`\n=== pt len ${bytes.length} (${Math.round(printable*100)}% printable) keylen ${c.key.length} B=${c.B} ===`);
  console.log('  head bytes:', [...bytes].slice(0,80));
  console.log('  ascii head:', txt.slice(0,200));
  writeFileSync(`/tmp/opencode/fp/al-pt-${bytes.length}.bin`, Buffer.from(bytes));
}
writeFileSync('/tmp/opencode/fp/al-caps.json', JSON.stringify(caps.map(c=>({ptlen:c.pt.length, keylen:c.key.length, B:c.B, pt:c.pt.slice(0,200)})),null,1));
srv.close(); await b.close();
