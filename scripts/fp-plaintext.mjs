#!/usr/bin/env node
/** fp-plaintext.mjs — hook the agent's request-build boundary to capture the
 *  PLAINTEXT signals it ships (before P0 encryption). Patch JSON.stringify +
 *  TextEncoder at the module level. */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync } from 'node:fs';
const PUB="bYngJqyRNqwrfbXptlan";
const srv=http.createServer((req,res)=>{res.setHeader("Content-Type","text/html");res.end("<!doctype html><html><body>FP</body></html>");});
await new Promise(r=>srv.listen(0,"127.0.0.1",r));
const port=srv.address().port;
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
const page=await ctx.newPage();
const caps=[];
await page.addInitScript(()=>{
  self.__caps=[];
  const oj=JSON.stringify;
  window.JSON.stringify=function(v,...a){ let s; try{s=oj.call(this,v,...a);}catch(e){return oj.apply(this,arguments);} if(typeof s==='string'&&s.length>20&&self.__caps.length<500) self.__caps.push(['json',s.length,s.slice(0,3000)]); return s; };
});
await page.route("**/*", async route=>{
  const u=route.request().url();
  if(/api\.fpjs\.io/.test(u)) await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({requestId:"local-x",visitorId:"local-v",confidence:{score:1},products:{}})});
  else await route.continue();
});
await page.goto(`http://127.0.0.1:${port}/`);
await page.evaluate((pub)=>import(`https://fpjscdn.net/v4/${pub}`).then(m=>m.start({apiKey:pub})).then(a=>a.get()).catch(()=>{}), PUB);
await page.waitForTimeout(10000);
const capsList = await page.evaluate(()=>self.__caps||[]).catch(()=>[]);
console.log("stringify captures:", capsList.length);
// find the big ones that look like the fingerprint request
const big = capsList.filter(([k,l])=>l>200).sort((a,b)=>b[1]-a[1]);
for (const [k,l,s] of big.slice(0,6)){
  console.log(`\n=== ${k} len ${l} ===`);
  console.log(s.slice(0,1200));
}
writeFileSync("/tmp/opencode/fp/plaintext-caps.json", JSON.stringify(capsList,null,1));
srv.close(); await b.close();
