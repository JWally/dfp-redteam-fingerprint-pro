# Fingerprint Pro — the shipped payload in PLAINTEXT (2026-11-01)

**We can now read the exact JSON payload that Fingerprint Pro ships to
`api.fpjs.io`, in full plaintext, at the encryption boundary — before it's
sealed into the P0 envelope.**

## How (the boundary)

The v4.1.6 loader builds the request as:
`body = base64url(agentMetadata) : base64url(encrypted)` where the payload is
`Tf()`-serialized → deflate-raw compressed → **`QK` = `kl(payload, KE=[3,14], JE=3, xE=9)`**
(a self-decrypting XOR envelope: header byte `S`, key bytes `S+G[i]`, a random
`x` pad, and a **9-byte key `f` carried inside the ciphertext**, then
`payload[i] XOR f[i%9]`).

The key insight: **the XOR key ships inside the envelope itself** — so the
"encryption" is recoverable by anyone who parses it. We didn't need to break
anything: we hooked `QK` (the encrypt function) and captured its **input**, which
is the plaintext JSON. (The earlier finding — "P0 envelope multi-layer encrypted,
not decryptable" — is still true for the *wire envelope* as shipped; but the
client builds it from readable plaintext a few instructions earlier, and the
in-band key means the cipher is recoverable even from the wire.)

## The payload (9,401 bytes, 153 signals)

```json
{
  "c": "bYngJqyRNqwrfbXptlan",     // apiKey
  "m": "e", "mo": ["cm"], "gt": 1,
  "s58": { "b":[{"b":"Chromium","v":"148"},...], "m":false, "p":"Linux", "h":{"brands":"...","platform":"Linux","architecture":"x86",...} },
  "s101": "Mozilla/5.0 (X11; Linux x86_64) ... HeadlessChrome/148.0.7778.96 ...",
  "s74": { "version":"WebGL 1.0 ...", "vendorUnmasked":"Google Inc. (Google)", "rendererUnmasked":"ANGLE (Google, Vulkan 1.3.0 (SwiftShader ...))" },
  "s75": { "contextAttributes":"6b1ed336...", "parameters":"57a2cddb...", "shaderPrecisions":"38a06fe0...", "extensions":"a96513a0...", ... },
  "s87": { "ac":"rgb(0, 0, 0)", "act":"rgb(0, 0, 0)", ... },        // computed styles
  "s209": { "s":[-1076970240,...], "p":[171,142,109,255,...], "d":4 }, // canvas pixels
  "s51": { "default":149.31, "apple":149.31, "serif":149.31, "sans":144.01, "mono":133.06 }, // font metrics
  "s49": [0.0999, 0.1000],                                           // audio FFT
  "s48": [925808888, -57135917, ...],                                 // canvas color hash
  "s157": { "selenium":false, "phantomjs":false, "headless_chrome":false, "webdriver":false, ... }, // automation
  "s215": { "cc":true, "cg":true, "ecb":true, "epy":false, ... },     // WebAuthn extensions
  "s145": ["getGamepads","javaEnabled","sendBeacon","vibrate",...],   // navigator API presence
  "s119": "TypeError: ... at wl (https://fpjscdn.net/v4/...)",        // leaks a JS stack trace
  "s9": "America/Chicago", "s3": 24, "s7": 12, "s5":[900,1280], "s84":{"w":1280,"h":900},
  "s94": { "u":"ae6bd0ef-...", ... },                                 // session/request uuid
  ...
}
```

Full 153-key dictionary in `artifacts/plaintext/shipped-payload-plaintext.json`.

## What this means

- **The payload is fully readable and tamperable at the client boundary.** Any
  signal (canvas `s209`, webgl `s75`, UA `s101`, automation `s157`, timezone
  `s9`) can be modified in the plaintext JSON before `QK` seals it — and the
  in-band XOR key means even a captured wire envelope is reversible.
- **Identity is still server-owned**: the `visitor_id` returned (`SO22bXJzkmCItm0BYYzJ`)
  is computed server-side from these signals; minting a *different* identity is
  the tamper-differential we already proved (spoofed signals → different
  accepted visitor_id). But now we can see and control every input.
- The `suspect_score` (37) is server-side too.

## Honest caveats

- We captured the plaintext at the `QK` boundary by serving the real loader
  with a hook — a client-side observation, nothing forwarded.
- We did NOT ship modified payloads to the live API this pass (the prior
  tamper differential already showed server acceptance of changed signals).
- The wire P0 envelope format is separate from this plaintext; the envelope
  itself remains obfuscated, but the in-band key makes it reversible.

## Scripts / artifacts

- `bots/fp-plain5.mjs` — captures plaintext at the QK boundary
- `artifacts/plaintext/shipped-payload-plaintext.json` — the 9,401-byte payload
- `artifacts/plaintext/qk-boundary-capture.json`, `ik-records.json` — raw captures
