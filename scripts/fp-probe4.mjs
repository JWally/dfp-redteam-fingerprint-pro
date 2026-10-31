#!/usr/bin/env node
/** fp-probe4.mjs — correct v4 module usage. The v4 loader is an ES module;
 *  import() it and inspect its exports, then drive whatever starts the agent. */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
const PUB = 'bYngJqyRNqwrfbXptlan';
const srv = http.createServer((req,res)=>{ res.setHeader('Content-Type','text/html'); res.end('<!doctype html><html><body>FP</body></html>'); });
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port = srv.address().port;
const b = await chromium.launch({ headless:true });
const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const page = await ctx.newPage();
const log = { requests:[], bundles:{}, posts:[] };
page.on('request', req => {
  const u = req.url();
  if (/fingerprint|fpjs|fpcdn|fpjscdn|fpnpmcdn|api\.fpjs|\.fingerprint|\.fpjs\.io/.test(u)) {
    log.requests.push({ method: req.method(), type: req.resourceType(), url: u.slice(0,220) });
    if (req.method()==='POST') log.posts.push({ url: u.slice(0,160), postData: (req.postData()||'').slice(0,6000) });
  }
});
page.on('response', async r => {
  const u = r.url();
  if (/\.js($|\?)/.test(u) && /fingerprint|fpjs|fpcdn|fpjscdn|fpnpmcdn/.test(u)) {
    try { const body = await r.text(); if (body.length > 5000) log.bundles[u] = body; } catch(_){}
  }
});
await page.route('**/*', async route => {
  const u = route.request().url();
  if (/api\.fpjs\.pro|api\.fingerprint\.com|\.fpcdn\.io|\.fpjs\.io/.test(u)) {
    await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ requestId:'local-'+Date.now(), visitorId:'local-vid-0000', confidence:{score:1}, products:{} }) });
  } else await route.continue();
});
await page.goto(`http://127.0.0.1:${port}/`);
const r = await page.evaluate(async (pub) => {
  const out = {};
  try {
    const mod = await import(`https://fpjscdn.net/v4/${pub}`);
    out.exports = Object.keys(mod);
    out.types = {};
    for (const k of Object.keys(mod)) out.types[k] = typeof mod[k];
    // try to start the agent
    if (typeof mod.start === 'function') {
      try { const r2 = mod.start({ apiKey: pub }); out.startRes = typeof r2; out.startVal = String(r2).slice(0,100); } catch(e){ out.startErr = String(e).slice(0,150); }
    }
  } catch(e) { out.err = String(e).slice(0,200); }
  return out;
}, PUB).catch(e=>({err:String(e).slice(0,200)}));
await page.waitForTimeout(12000);
console.log('module:', JSON.stringify(r,null,1).slice(0,900));
console.log('\nrequests:', log.requests.length);
const hosts = {};
for (const x of log.requests) { try { hosts[new URL(x.url).host]=(hosts[new URL(x.url).host]||0)+1; } catch(_){} }
console.log('hosts:', JSON.stringify(hosts));
console.log('\n=== POSTs ===');
for (const p of log.posts.slice(0,3)) { console.log('\n  ', p.url); console.log('  ', p.postData.slice(0,700)); }
mkdirSync('/tmp/opencode/fp/assets',{recursive:true});
for (const [u,body] of Object.entries(log.bundles)) {
  const name = u.split('/').pop().split('?')[0];
  writeFileSync('/tmp/opencode/fp/assets/'+name, body);
  console.log('saved:', name, Math.round(body.length/1024)+'KB');
}
writeFileSync('/tmp/opencode/fp/probe4.json', JSON.stringify({r, posts:log.posts, requests:log.requests.slice(0,50)},null,2));
srv.close(); await b.close();
