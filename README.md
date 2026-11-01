# dfp-redteam-fingerprint-pro — Fingerprint Pro

Fingerprint Pro's device-intelligence stack (live-key assessment). Full details:
`FINGERPRINT_PRO_ASSESSMENT_2026_10_26.md`, `FINGERPRINT_PRO_LIVEKEY_2026_10_31.md`,
`FINGERPRINT_PLAINTEXT_PAYLOAD_2026_11_01.md` (the payload break).

---

## What we observed (the shipped payload)

**The full client payload is readable in plaintext at the seal boundary —
153 signals, 9,401 bytes — captured with a live key.**

The loader builds the request as `Tf-serialize → deflate-raw → kl(payload,
KE, JE, xE)` where the seal is a **self-decrypting XOR envelope whose 9-byte
key rides inside the ciphertext**. Because the key is in-band, the wire P0
envelope is reversible — and hooking `QK` (the encrypt boundary) reveals the
input: the plaintext JSON.

```json
{
  "c": "bYngJqyRNqwrfbXptlan",        // apiKey
  "m": "e", "mo": ["cm"], "gt": 1,
  "s58":  { "b": [{"b":"Chromium","v":"148"},...], "m": false, "p": "Linux", "h": {...} },
  "s101": "Mozilla/5.0 (X11; Linux x86_64) ...",   // UA
  "s74":  { "version":"WebGL 1.0 ...", "vendorUnmasked":"Google Inc. (Google)", "rendererUnmasked":"ANGLE (Google, Vulkan ...)" },
  "s75":  { "contextAttributes":"6b1ed336...", "parameters":"57a2cddb...", "extensions":"a96513a0...", ... },
  "s87":  { "ac":"rgb(0, 0, 0)", ... },                   // computed styles
  "s209": { "s":[-1076970240,...], "p":[171,142,109,255,...], "d":4 },  // canvas pixels
  "s51":  { "default":149.3, "apple":149.3, "serif":149.3, "sans":144.0, "mono":133.1 },  // font metrics
  "s49":  [0.0999, 0.1000],                                // audio FFT
  "s157": { "selenium":false, "phantomjs":false, "headless_chrome":false, "webdriver":false },
  "s215": { "cc":true, "cg":true, "ecb":true, "epy":false, ... },  // WebAuthn ext support
  "s119": "TypeError: ... at wl (https://fpjscdn.net/v4/...)",    // leaked JS stack trace
  ...
}
```

118 of 153 signals carried values in the capture; key signal map below.

## The harness

`scripts/fp-plain5.mjs` — serves the real loader with a hook on `QK` (the
XOR-seal boundary) and captures the plaintext JSON that ships:

```bash
node scripts/fp-plain5.mjs
```

> requires the loader at `/tmp/opencode/fp/v4.js` + a valid `PUB` key set in
> the script (the repo does not ship private keys; the public browser key is
> the one used in the run).

### Captured proof (2026-11-01)

```
QK calls: 7
=== QK#0: in 3200B compressed=True -> out 3213B
  decompressed (deflate-raw): 9401 bytes
  head: {"c":"bYngJqyRNqwrfbXptlan","m":"e","mo":["cm"],"s56":...,"s58":{"b":[...brands...]...}}
```

Full artifact: `artifacts/plaintext/shipped-payload-plaintext.json` (9,401 B,
153 keys). Related evidence: `qk-boundary-capture.json` (the QK input/output),
`ik-records.json` (the decompressed probe descriptors). The tamper differential
(prior pass) showed spoofed signals → server accepted a **different** visitor_id
(`SO22… → D4m9…`).

**Honest position:** the payload is fully readable/tamperable at the client
boundary, but the **identity (`visitor_id`) is server-computed + signed** —
reading/tampering the payload changes inputs, not the trust decision.

## Status

- 🟢 Read payload: full 153-signal plaintext JSON captured at the `QK` (XOR-seal) boundary
- 🟢 Tamper with payload: every signal editable before sealing; different accepted visitor_id proven
- 🔴 Mint token: identity is server-computed + signed; not client-mintable

## Demo video — the full shipped payload

`assets/videos/full-payload-demo.mp4` — a terminal-capture video of
`scripts/demo-fp.py` printing the **complete 153-key shipped payload**
(9,401 B, captured at the `QK` seal boundary from the live loader, no
truncation). Reproduce it yourself:

```bash
python3 scripts/demo-fp.py artifacts/plaintext/shipped-payload-plaintext.json
```

The full plaintext JSON is also at
`artifacts/plaintext/shipped-payload-plaintext.json`.

## Files

- `scripts/fp-plain5.mjs` — the QK-boundary plaintext capture harness
- `scripts/fp-tamper.mjs`, `fp-probe*.mjs`, `fp-al-hook*.mjs` — prior passes
- `artifacts/plaintext/` — shipped-payload-plaintext.json, qk-boundary-capture.json, ik-records.json
- writeups: assessment (10-26), live key (10-31), plaintext payload (11-01)
