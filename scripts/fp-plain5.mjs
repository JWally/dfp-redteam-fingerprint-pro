#!/usr/bin/env node
/** fp-plain5.mjs — capture the PLAINTEXT payload at the QK (kl XOR) boundary,
 *  plus the encrypted output and raw POST body, so we can show the exact
 *  plaintext the server receives. */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';
const PUB="bYngJqyRNqwrfbXptlan";
let loader = readFileSync('/tmp/opencode/fp/v4.js','utf-8');

// wrap QK: capture input (plaintext) + output (encrypted)
const from = 'function QK(y,G){return kl(y,G?KE:BE,JE,xE)}';
const to   = `function QK(y,G){try{const u=y instanceof Uint8Array?y:new Uint8Array(y);let bin='';for(let i=0;i<u.length;i++)bin+=String.fromCharCode(u[i]);self.__qk=(self.__qk||[]);self.__qk.push({inLen:u.length,inB64:btoa(bin),compressed:!!G});}catch(_){}const r=kl(y,G?KE:BE,JE,xE);try{const u=r instanceof Uint8Array?r:new Uint8Array(r);let bin='';for(let i=0;i<u.length;i++)bin+=String.fromCharCode(u[i]);const e=self.__qk[self.__qk.length-1];if(e&&e.outLen===undefined){e.outLen=u.length;e.outB64=btoa(bin);}}catch(_){}return r;}`;
if (!loader.includes(from)) { console.error("QK TARGET NOT FOUND"); process.exit(1); }
loader = loader.replace(from, to);
writeFileSync('/tmp/opencode/fp/v4-hooked.js', loader);

const srv=http.createServer((req,res)=>{res.setHeader("Content-Type","text/html");res.end("<!doctype html><html><body>FP</body></html>");});
await new Promise(r=>srv.listen(0,"127.0.0.1",r));
const port=srv.address().port;
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
const page=await ctx.newPage();
await page.route(`**/v4/${PUB}`, route => route.fulfill({ status:200, contentType:'application/javascript', body: loader }));
const posts=[];
page.on('request', req=>{ const u=req.url(); if(u.includes('fpjs.io') && req.method()==='POST'){ try{ posts.push({url:u.slice(0,90), len:req.postDataBuffer()?req.postDataBuffer().length:0}); }catch(e){ } } });
await page.goto(`http://127.0.0.1:${port}/`);
await page.evaluate((pub)=>import(`https://fpjscdn.net/v4/${pub}`).then(m=>m.start({apiKey:pub})).then(a=>a.get()).catch(()=>{}), PUB);
await page.waitForTimeout(15000);

const qk = await page.evaluate(()=>self.__qk||[]).catch(e=>({err:String(e).slice(0,150)}));
console.log('QK calls:', Array.isArray(qk)?qk.length:0);
for(const e of (Array.isArray(qk)?qk:[]).slice(0,5)){
  console.log('\n=== QK in', e.inLen, '-> out', e.outLen, '| compressed:', e.compressed);
  // decode input
  const buf = Buffer.from(e.inB64||'', 'base64');
  console.log('  PLAINTEXT head:', buf.slice(0,300).toString('latin1'));
}
console.log('\nPOSTs:', posts.length);
writeFileSync('/tmp/opencode/fp/plain-qk.json', JSON.stringify({qk, posts}, null, 2));
srv.close(); await b.close();
