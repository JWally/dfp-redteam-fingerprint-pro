#!/usr/bin/env node
/** fp-al-hook3.mjs — debug what Al actually receives. */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';
const PUB="bYngJqyRNqwrfbXptlan";
let loader = readFileSync('/tmp/opencode/fp/v4.js','utf-8');
const from = 'function Al(y,G,B){const K=sf(G());';
const to   = 'function Al(y,G,B){const K=sf(G());try{var __info={ctype:Object.prototype.toString.call(y), ctor:y&&y.constructor?y.constructor.name:"?", len:y&&y.length!==undefined?y.length:"n/a", bytel:y&&y.byteLength!==undefined?y.byteLength:"n/a", isUint8:y instanceof Uint8Array, isUint32:y instanceof Uint32Array, sample:null, keytype:Object.prototype.toString.call(G), keylen:G&&G.length!==undefined?G.length:"n/a"};if(y&&y.length!==undefined&&y.length<50){__info.sample=Array.from(y).slice(0,20);}(self.__al=self.__al||[]).length<200&&self.__al.push(__info);}catch(_){}';
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
console.log('captures:', caps.length);
for (const c of caps.slice(0,8)) console.log(JSON.stringify(c).slice(0,300));
writeFileSync('/tmp/opencode/fp/al-debug.json', JSON.stringify(caps,null,1));
srv.close(); await b.close();
