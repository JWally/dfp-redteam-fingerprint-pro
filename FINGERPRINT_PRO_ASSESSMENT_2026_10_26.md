# Fingerprint Pro — client-side assessment (how does it hold up?)

**Date:** 2026-10-26
**Subject:** FingerprintJS commercial product (fingerprint.com) — the JavaScript
agent + its client/server boundary
**Method:** public SDK analysis (Pro loader v3.12.16 npm + v4.1.6 CDN loader,
open-source `@fingerprintjs/fingerprintjs` v5.3.0 engine, docs/API contract) +
live observation of the official demo. Telemetry fulfilled locally / never
forwarded by us (the official demo page made its own server-side calls).

> **TL;DR — Fingerprint Pro holds up better than any of the other vendors we've
> drilled (Stytch, Oscilar, Verisoul, Keyri), for a specific architectural
> reason: the client does NOT mint the identity. The `visitorId` is computed
> **server-side** from raw signals and bound with a **cryptographically signed
> visitor-token cookie**. You can read/spoof the client signals, but you cannot
> forge a *target's* visitor ID — only produce a *different* synthetic one.

---

## 1. What the client actually is

- **Pro JS agent** is loaded by the Pro **loader**:
  - npm: `@fingerprintjs/fingerprintjs-pro` → `load({apiKey, endpoint, scriptUrlPattern})`
  - script-tag: `https://fpjscdn.net/v4/<PUBLIC_API_KEY>` (v4) / `fpnpmcdn.net/v3/<key>/loader_v<ver>.js` (npm)
  - The agent itself is a CDN bundle, keyed by your **public API key**, and runs
    in a **Service Worker** (that's why page-level hooks can't see it).
- The backend is `api.fpjs.pro` (Server API requires a **secret** key — the
  client only ever uses the public key).
- The open-source `@fingerprintjs/fingerprintjs` v5.3.0 (MIT) is the same
  company's client engine: ~100 components (canvas, audio, fonts, WebGL, emoji,
  screen, touch, timezone, UA-CH, plugins, vendor, hardware, math…) hashed with
  **MurmurHash3**, with a confidence model. Per their own docs, **Pro builds on
  this library** — Pro adds the server-side identity + Smart Signals.

## 2. The load flow (from the real v3/v4 loaders)

```
load({apiKey})  → injects loader script from CDN (key in URL path)
                 → loader fetches the agent bundle (key in URL path)
                 → agent collects signals, POSTs to api.fpjs.pro/events
                 → response contains requestId + visitorToken
                 → loader decodes response, sets a signed cookie (prefix `_vid_`,
                   365d), and hands data back via handleAgentData / Worker
```

Error model is rich and server-aware: `api_key_invalid`, `csp_block`,
`wrong_region`, `subscription_not_active`, `rate_limit`, `token_expired` (tokens
expire), `forbidden_endpoint/origin/header`, etc. — the client is explicitly
designed around a server-validated contract, not self-contained fingerprinting.

## 3. Weak client-side "crypto" (same disease, but it doesn't matter much)

The v4 loader decodes the agent/backend payload with a hand-rolled XOR:

```js
// pE(): verify a magic prefix (G), then byte-XOR the body with a rotating key
for (let y = 0; y < T.length; ++y) T[y] = J[q + y] ^ J[E + y % B];
```

Key-in-code obfuscation, same class as Verisoul's `dd` — trivially reversible
by anyone with the bundle. **But** the protected object is a `requestId`/token
handshake, NOT the identity itself, so reversing it doesn't let you mint a
visitor ID.

## 4. Why it holds up better (the architectural difference)

| Vendor (today) | Where the identity is made | Can you forge a *specific* identity client-side? |
|---|---|---|
| **Fingerprint Pro** | **server** (proprietary model, fuzzy/dedup) | **No** — only a different synthetic one |
| Stytch DFP | client session + server | partial (fresh session, not a target) |
| Oscilar | client (`deviceID` in payload) | yes (mint/persist your own) |
| Verisoul | client-ish (`device_id`, `browser_id`) | yes (your own) |
| Signifyd lite.js | client (`device_id` from `browserFingerPrint`) | yes (mint fresh) |

- The client ships its full signal set (readable/spoofable like everyone), but
  the **visitor ID is server-owned**: you can't replay a target's fingerprint
  and get *their* ID — the server's model (plus the signed `_vid_` cookie /
  visitor token, IP/TLS context) assigns IDs, and a spoofed signal set yields a
  **different** stable ID.
- So the attacker's options are weaker than elsewhere: you can (a) read all
  client signals, (b) feed a synthetic "clean" set to get a **fresh synthetic
  visitorId** (the classic account-farming / history-fragmenting play), or
  (c) suppress signals. You **cannot** impersonate a specific victim or reuse a
  captured visitor token (server-signed + expiring).

## 5. Honest limitations of this assessment

- The exact **obfuscated Pro agent bundle was not obtained**: it is CDN-gated
  by a valid public key (the only public key found — in Fingerprint's archived
  example repo — is deactivated; the CDN serves a 256-byte `API key not found`
  stub) and it runs in a Service Worker. Analysis covers the real loader (both
  versions), the real OSS engine, the API contract, and live server-side demo
  behavior — not a static audit of the commercial bundle itself.
- No backend verdicts were requested; no account/trial was created.
- "Holds up better" = identity forgery is hard server-side; it does **not**
  mean the client signals are protected (they're not) or that bot abuse is
  impossible (a synthetic clean visitorId is still achievable — which is why
  they layer BotD / server checks).

## 6. Interview line

> *"Fingerprint Pro is the strongest of the device-ID vendors I've examined,
> because it moved the identity to the server: the client only collects
> signals, the visitor ID is computed and signed server-side, and the
> visitor-token cookie is cryptographically bound. You can read every signal
> the client ships and feed it a synthetic clean set to get a fresh synthetic
> ID — but you can't forge a specific victim's visitor ID or replay their
> token. The client isn't secure (it's still client code), but the *identity
> boundary* is — and that's the right place for it to be."*

## 7. Artifacts

| File | What |
|---|---|
| `/tmp/opencode/fpjs/package/dist/fp.esm.min.js` | real Pro loader v3.12.16 (npm) |
| `/tmp/opencode/fpjs/pro-agent.js` | real Pro CDN loader v4.1.6 |
| `/tmp/opencode/fpjs/package/dist/fp.js` | OSS agent v5.3.0 (same company's engine) |
| `bots/fpjs-probe.mjs` / `fpjs-probe2.mjs` / `fpjs-demo.mjs` | probes (local fulfillment) |
| `/tmp/opencode/fpjs/*.json` | probe captures |
