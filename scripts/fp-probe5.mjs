#!/usr/bin/env node
/** fp-probe5.mjs — drive the v4 agent fully: start() then get(), capture the
 *  api.fpjs.io/events POST payload in plaintext. */
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
const log = { requests:[], bundles:{}, posts:[], sw:[] };
page.on('request', req => {
  const u = req.url();
  if (/fingerprint|fpjs|fpcdn|fpjscdn|fpnpmcdn|api\.fpjs|\.fingerprint|\.fpjs\.io/.test(u)) {
    log.requests.push({ method: req.method(), type: req.resourceType(), url: u.slice(0,220) });
    if (req.method()==='POST') log.posts.push({ url: u.slice(0,160), postData: (req.postData()||'').slice(0,8000) });
  }
});
page.on('response', async r => {
  const u = r.url();
  if (/\.js($|\?)/.test(u) && /fingerprint|fpjs|fpcdn|fpjscdn|fpnpmcdn/.test(u)) {
    try { const body = await r.text(); if (body.length > 5000) log.bundles[u] = body; } catch(_){}
  }
  if (/api\.fpjs\.io|api\.fpjs\.pro/.test(u)) {
    try { log.posts.push({ url: u.slice(0,120)+' [RESP]', postData: (await r.text()).slice(0,1200) }); } catch(_){}
  }
});
// capture the response WITHOUT fulfilling (read-only) so we see real vs local
await page.route('**/*', async route => {
  const u = route.request().url();
  if (/api\.fpjs\.io|api\.fpjs\.pro/.test(u)) {
    await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ requestId:'local-'+Date.now(), visitorId:'local-vid-0000', confidence:{score:1}, products:{} }) });
  } else await route.continue();
});
await page.goto(`http://127.0.0.1:${port}/`);
const r = await page.evaluate(async (pub) => {
  const out = {};
  try {
    const mod = await import(`https://fpjscdn.net/v4/${pub}`);
    const agent = await mod.start({ apiKey: pub });
    out.agentKeys = Object.keys(agent);
    // call get()
    const res = await agent.get();
    out.result = { visitorId: res.visitorId, requestId: res.requestId, confidence: res.confidence, keys: Object.keys(res) };
  } catch(e) { out.err = String(e).slice(0,250); }
  return out;
}, PUB).catch(e=>({err:String(e).slice(0,250)}));
await page.waitForTimeout(12000);
console.log('agent:', JSON.stringify(r,null,1).slice(0,800));
console.log('\nrequests:', log.requests.length);
const hosts = {};
for (const x of log.requests) { try { hosts[new URL(x.url).host]=(hosts[new URL(x.url).host]||0)+1; } catch(_){} }
console.log('hosts:', JSON.stringify(hosts));
console.log('\n=== POSTs ===');
for (const p of log.posts.slice(0,4)) { console.log('\n  ', p.url); console.log('  ', p.postData.slice(0,1000)); }
mkdirSync('/tmp/opencode/fp/assets',{recursive:true});
for (const [u,body] of Object.entries(log.bundles)) {
  const name = u.split('/').pop().split('?')[0];
  writeFileSync('/tmp/opencode/fp/assets/'+name, body);
  console.log('saved:', name, Math.round(body.length/1024)+'KB');
}
writeFileSync('/tmp/opencode/fp/probe5.json', JSON.stringify({r, posts:log.posts, requests:log.requests.slice(0,60)},null,2));
srv.close(); await b.close();
