#!/usr/bin/env node
/** fp-probe3.mjs — correct v4 loader usage: script-tag global FingerprintJS.load(). */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
const PUB = 'bYngJqyRNqwrfbXptlan';

const srv = http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><html><body>FP test</body></html>');
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port = srv.address().port;

const b = await chromium.launch({ headless:true });
const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const page = await ctx.newPage();
const log = { requests:[], bundles:{}, posts:[] };

page.on('request', req => {
  const u = req.url();
  if (/fingerprint|fpjs|fpcdn|fpjscdn|fpnpmcdn|api\.fpjs|\.fingerprint/.test(u)) {
    log.requests.push({ method: req.method(), type: req.resourceType(), url: u.slice(0,200) });
    if (req.method()==='POST') log.posts.push({ url: u.slice(0,160), postData: (req.postData()||'').slice(0,5000) });
  }
});
page.on('response', async r => {
  const u = r.url();
  if (/\.js($|\?)/.test(u) && /fingerprint|fpjs|fpcdn|fpjscdn|fpnpmcdn/.test(u)) {
    try { const body = await r.text(); if (body.length > 10000) log.bundles[u] = body; } catch(_){}
  }
});
// fulfill the events API locally (capture but never forward)
await page.route('**/*', async route => {
  const u = route.request().url();
  if (/api\.fpjs\.pro|api\.fingerprint\.com|\.fpcdn\.io|\.fpjs\.io/.test(u)) {
    await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ requestId:'local-'+Date.now(), visitorId:'local-vid-0000', confidence:{score:1}, products:{} }) });
  } else await route.continue();
});

await page.goto(`http://127.0.0.1:${port}/`);
// load the loader as a script tag, then use the global
await page.addScriptTag({ url: `https://fpjscdn.net/v4/${PUB}` }).catch(e=>console.log('tag err:', String(e).slice(0,120)));
await page.waitForTimeout(5000);
const r = await page.evaluate(async (pub) => {
  const out = { hasGlobal: typeof FingerprintJS !== 'undefined', keys: typeof FingerprintJS==='object' ? Object.keys(FingerprintJS) : null };
  if (typeof FingerprintJS !== 'undefined' && FingerprintJS.load) {
    try {
      const fp = await FingerprintJS.load({ apiKey: pub });
      out.loaded = true;
      const res = await fp.get();
      out.result = { visitorId: res.visitorId, requestId: res.requestId, confidence: res.confidence };
    } catch(e) { out.err = String(e).slice(0,200); }
  } else { out.err = 'no FingerprintJS.load'; }
  return out;
}, PUB).catch(e=>({err:String(e).slice(0,200)}));
await page.waitForTimeout(12000);

const state = await page.evaluate(() => ({
  cookies: document.cookie.split(';').map(c=>c.trim().split('=')[0]),
})).catch(()=>({}));

console.log('eval:', JSON.stringify(r,null,1).slice(0,800));
console.log('\nrequests:', log.requests.length, '| bundles:', Object.keys(log.bundles).length);
const hosts = {};
for (const x of log.requests) { try { hosts[new URL(x.url).host]=(hosts[new URL(x.url).host]||0)+1; } catch(_){} }
console.log('hosts:', JSON.stringify(hosts));
console.log('cookies:', state.cookies);
console.log('\n=== POSTs ===');
for (const p of log.posts.slice(0,3)) { console.log('\n  ', p.url); console.log('  ', p.postData.slice(0,800)); }
mkdirSync('/tmp/opencode/fp/assets',{recursive:true});
for (const [u,body] of Object.entries(log.bundles)) {
  const name = u.split('/').pop().split('?')[0];
  writeFileSync('/tmp/opencode/fp/assets/'+name, body);
  console.log('saved:', name, Math.round(body.length/1024)+'KB');
}
writeFileSync('/tmp/opencode/fp/probe3.json', JSON.stringify({r, state, posts:log.posts, requests:log.requests.slice(0,50)},null,2));
srv.close(); await b.close();
