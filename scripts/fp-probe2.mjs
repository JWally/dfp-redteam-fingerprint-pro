#!/usr/bin/env node
/** fp-probe2.mjs — same as probe but on a real local origin so cookies work. */
import { chromium } from 'playwright';
import http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
const PUB = 'bYngJqyRNqwrfbXptlan';

const srv = http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><html><body><div id="root">FP test</div></body></html>');
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const port = srv.address().port;

const b = await chromium.launch({ headless:true });
const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const page = await ctx.newPage();
const log = { requests:[], bundles:{}, posts:[] };

page.on('request', req => {
  const u = req.url();
  if (/fingerprint|fpjs|fpcdn|fpjscdn|fpnpmcdn|api\.fpjs/.test(u)) {
    log.requests.push({ method: req.method(), type: req.resourceType(), url: u.slice(0,200) });
    if (req.method()==='POST') log.posts.push({ url: u.slice(0,150), postData: (req.postData()||'').slice(0,4000) });
  }
});
page.on('response', async r => {
  const u = r.url();
  if (/\.js($|\?)/.test(u) && /fingerprint|fpjs|fpcdn|fpjscdn|fpnpmcdn/.test(u)) {
    try { const body = await r.text(); if (body.length > 10000) log.bundles[u] = body; } catch(_){}
  }
});
// fulfill fingerprint API locally
await page.route('**/*', async route => {
  const u = route.request().url();
  if (/api\.fpjs\.pro|api\.fingerprint\.com|\.fpcdn\.io/.test(u)) {
    await route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ requestId:'local-'+Date.now(), visitorId:'local-vid-0000', confidence:{score:1} }) });
  } else await route.continue();
});

await page.goto(`http://127.0.0.1:${port}/`);
await page.evaluate((pub) => import(`https://fpjscdn.net/v4/${pub}`).then(m=>m.load()).then(fp=>fp.get()).catch(e=>({err:String(e).slice(0,150)})), PUB).then(r=>console.log('get() result:', JSON.stringify(r).slice(0,300))).catch(e=>console.log('eval err:', String(e).slice(0,150)));
await page.waitForTimeout(15000);

const state = await page.evaluate(() => ({
  cookies: document.cookie.split(';').map(c=>c.trim().split('=')[0]).filter(c=>/_vid|fpjs|_fp|fpid/i.test(c)),
})).catch(e=>({err:String(e).slice(0,120)}));

console.log('\nrequests:', log.requests.length, '| bundles:', Object.keys(log.bundles).length);
const hosts = {};
for (const r of log.requests) { try { const h=new URL(r.url).host; hosts[h]=(hosts[h]||0)+1; } catch(_){} }
console.log('hosts:', JSON.stringify(hosts,null,1));
console.log('\ncookies:', state.cookies);
console.log('\n=== POSTs ===');
for (const p of log.posts.slice(0,3)) { console.log('  ', p.url); console.log('  ', p.postData.slice(0,500)); }
mkdirSync('/tmp/opencode/fp/assets',{recursive:true});
for (const [u,body] of Object.entries(log.bundles)) {
  const name = u.split('/').pop().split('?')[0];
  writeFileSync('/tmp/opencode/fp/assets/'+name, body);
  console.log('saved:', name, Math.round(body.length/1024)+'KB');
}
writeFileSync('/tmp/opencode/fp/probe2.json', JSON.stringify({state, posts:log.posts, requests:log.requests.slice(0,50)},null,2));
srv.close(); await b.close();
