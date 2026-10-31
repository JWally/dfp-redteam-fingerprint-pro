#!/usr/bin/env node
/** fp-tamper.mjs — clean vs tampered differential against the REAL Fingerprint
 *  API (user-owned key). Modify client signals, observe visitor_id + scores. */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync } from 'node:fs';
const PUB="bYngJqyRNqwrfbXptlan";

async function run(label, mutate){
  const srv=http.createServer((req,res)=>{res.setHeader("Content-Type","text/html");res.end("<!doctype html><html><body>FP</body></html>");});
  await new Promise(r=>srv.listen(0,"127.0.0.1",r));
  const port=srv.address().port;
  const b=await chromium.launch({headless:true});
  const ctx=await b.newContext({viewport:{width:1280,height:900}});
  const page=await ctx.newPage();
  if (mutate) await page.addInitScript(mutate);
  let out={};
  try{
    await page.goto(`http://127.0.0.1:${port}/`);
    out = await page.evaluate(async (pub)=>{
      const mod=await import(`https://fpjscdn.net/v4/${pub}`);
      const agent=await mod.start({apiKey:pub});
      const res=await agent.get();
      return { visitorId: res.visitor_id, eventId: res.event_id, suspectScore: res.suspect_score, sealed: !!res.sealed_result };
    }, PUB).catch(e=>({err:String(e).slice(0,200)}));
  }catch(e){ out.err=String(e).slice(0,150); }
  await b.close(); srv.close();
  return {label, ...out};
}

const clean = await run('clean', null);
// tamper 1: change UA + screen + platform + hardware
const tamperA = await run('tamper-ua-screen', () => {
  Object.defineProperty(Navigator.prototype,'userAgent',{get(){return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';}});
  Object.defineProperty(Navigator.prototype,'platform',{get(){return 'MacIntel';}});
  Object.defineProperty(Navigator.prototype,'hardwareConcurrency',{get(){return 16;}});
  Object.defineProperty(Navigator.prototype,'deviceMemory',{get(){return 64;}});
  Object.defineProperty(Navigator.prototype,'maxTouchPoints',{get(){return 5;}});
  Object.defineProperty(Screen.prototype,'width',{get(){return 2560;}});
  Object.defineProperty(Screen.prototype,'height',{get(){return 1440;}});
  Object.defineProperty(Screen.prototype,'colorDepth',{get(){return 30;}});
  Object.defineProperty(Screen.prototype,'pixelDepth',{get(){return 30;}});
  Object.defineProperty(Navigator.prototype,'language',{get(){return 'fr-FR';}});
});

console.log('=== FINGERPRINT PRO TAMPER DIFFERENTIAL (real API) ===');
for (const r of [clean, tamperA]) {
  console.log(`${r.label}: visitor=${r.visitorId} suspect=${r.suspectScore} event=${r.eventId}`);
}
console.log('\nvisitor differs:', clean.visitorId !== tamperA.visitorId);
writeFileSync('/tmp/opencode/fp/tamper-results.json', JSON.stringify({clean,tamperA},null,2));
