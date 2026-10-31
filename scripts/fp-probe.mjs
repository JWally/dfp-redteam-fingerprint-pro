#!/usr/bin/env node
/** fp-probe.mjs — load the REAL Fingerprint Pro agent with a live public key,
 *  capture every request (incl. api.fpjs.pro/events POST), the agent bundle,
 *  and the visitor-id cookie. All Fingerprint API responses fulfilled locally. */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const PUB = 'bYngJqyRNqwrfbXptlan'; // user's own public browser key (own stack)
const b = await chromium.launch({ headless:true });
const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const page = await ctx.newPage();
const log = { requests:[], bundles:{}, posts:[], cookies:[] };

page.on('request', req => {
  const u = req.url();
  if (/fingerprint|fpjs|fpcdn|fpjscdn|fpnpmcdn|api\.fpjs/.test(u)) {
    log.requests.push({ method: req.method(), type: req.resourceType(), url: u.slice(0,200) });
    if (/\/events/.test(u) && req.method()==='POST') log.posts.push({ url: u.slice(0,150), postData: (req.postData()||'').slice(0,3000) });
  }
});
page.on('response', async r => {
  const u = r.url();
  if (/\.js($|\?)/.test(u) && /fingerprint|fpjs|fpcdn|fpjscdn|fpnpmcdn/.test(u)) {
    try { const body = await r.text(); if (body.length > 10000) log.bundles[u] = body; } catch(_){}
  }
  if (/api\.fpjs\.pro/.test(u)) {
    try { log.posts.push({ url: u.slice(0,150)+' [RESP]', postData: (await r.text()).slice(0,1000) }); } catch(_){}
  }
});

// fulfill the fingerprint API locally (never forward), let assets through
await page.route('**/*', async route => {
  const u = route.request().url();
  if (/api\.fpjs\.pro|api\.fingerprint\.com|\.fpcdn\.io/.test(u)) {
    await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ requestId:'local-'+Date.now(), visitorId:'local-vid-0000', confidence:{score:1} }) });
  } else await route.continue();
});

// minimal page + load the Pro loader with the live key
await page.goto('about:blank');
await page.addScriptTag({ content: `
  (async () => {
    const fpPromise = import('https://fpjscdn.net/v4/${PUB}');
    const fp = await fpPromise;
    window.__fp = await fp.load();
    window.__result = await window.__fp.get();
    return window.__result;
  })()
` }).catch(e=>console.log('loader err:', String(e).slice(0,120)));
await page.waitForTimeout(15000);

const state = await page.evaluate(() => ({
  hasFp: !!window.__fp,
  result: window.__result ? { visitorId: window.__result.visitorId, requestId: window.__result.requestId, confidence: window.__result.confidence } : null,
  cookies: document.cookie.split(';').map(c=>c.trim().split('=')[0]).filter(c=>/_vid|fpjs|_fp/i.test(c)),
})).catch(e=>({err:String(e).slice(0,150)}));

console.log('requests:', log.requests.length, '| bundles:', Object.keys(log.bundles).length);
console.log('\nstate:', JSON.stringify(state,null,1).slice(0,700));
console.log('\n=== fingerprint hosts ===');
const hosts = {};
for (const r of log.requests) { try { const h=new URL(r.url).host; hosts[h]=(hosts[h]||0)+1; } catch(_){} }
for (const [h,n] of Object.entries(hosts)) console.log(`  ${n}  ${h}`);
console.log('\n=== events POSTs ===');
for (const p of log.posts.slice(0,3)) { console.log('  ', p.url); console.log('  ', p.postData.slice(0,400)); }
mkdirSync('/tmp/opencode/fp/assets',{recursive:true});
for (const [u,body] of Object.entries(log.bundles)) {
  const name = u.split('/').pop().split('?')[0];
  writeFileSync('/tmp/opencode/fp/assets/'+name, body);
  console.log('saved bundle:', name, Math.round(body.length/1024)+'KB');
}
writeFileSync('/tmp/opencode/fp/probe1.json', JSON.stringify({state, posts:log.posts, requests:log.requests.slice(0,40)},null,2));
await b.close();
