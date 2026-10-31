# Fingerprint Pro — live-key red team: payload + tamper (2026-10-31)

**Follow-on to `FINGERPRINT_PRO_ASSESSMENT_2026_10_26.md`** — that pass ran on
a **deactivated** public key (CDN served a stub). This pass used the **user's
own live keys** (`fingerprint.txt`): a 20-char public browser key + a 44-char
secret/server key. Authorized, own-stack, real API calls made only to the
user's own Fingerprint account (no third-party/prod traffic).

> **Result:** the live key works end-to-end. The real agent minted a **real
> `visitor_id`** from the real API, we **captured the encrypted request
> payload** (the `P0` envelope) and the plaintext signal fragments, and —
> decisively — **spoofing client signals produced a different, server-accepted
> `visitor_id`**. Goals achieved: payload captured; what's shipped can be
> changed and the server accepts it (a *fresh synthetic* identity). The one
> thing we cannot do is mint a *specific* target's ID — the identity is
> server-computed.

---

## 1. Key confirmation + full live flow

| Key | Type | Role |
|---|---|---|
| `bYngJqyRNqwrfbXptlan` | 20-char public browser key | embedded in page, loads agent from `fpjscdn.net/v4/<key>` |
| `<44-char secret>` | 44-char base64 (32B) | server/secret API key (redacted; not used client-side) |

Live flow (all observed; API calls to the user's own account):

```
import('https://fpjscdn.net/v4/<pub>')   → ES module { start, handleAgentData, ... }
start({apiKey})                            → agent { get, collect }
agent.get()                                → POST api.fpjs.io/?ci=js/4.1.6&q=<key>  (3,273B encrypted)
                                           → GET api.fpjs.io/xridvya/qAo6p?q=<key>  (collect)
                                           → response: { version, event_id, visitor_id, suspect_score, sealed_result, internal(enc) }
```

**Real response (user's own account):**
```json
{ "version":"4", "event_id":"1793453774007.GaLLRN",
  "visitor_id":"SO22bXJzkmCItm0BYYzJ", "suspect_score":37,
  "sealed_result":null,
  "internal":"5+r0HoXer…" }
```

The agent sets a signed `_vid_`-style cookie (365d) from this. Identity is
**server-computed** — the client ships signals, the server returns the ID.

## 2. The payload (what the client ships)

**Captured:** the `POST api.fpjs.io/?ci=…&q=…` body = **3,273 bytes** of the
`P0` encrypted envelope. Structure (analyzed):

- Header is **high-entropy** (varies per request → fresh per-request keying).
- The loader's own decryptor `pE(y,G,B)` (recovered):
  - verifies a **magic prefix**, reads a length field,
  - then `T[y] = J[q+y] ^ J[E + y%B]` — a **self-XOR** (the keystream is a
    section of the same buffer). Envelope, not plaintext.
- The `Al(y,G,B)` encryptor (recovered): `x[y] = K[y] ^ G[y%G.length]` — XOR
  with a **derived key** (random per request), applied to a 348×uint32 array
  that is itself already encrypted. **Layered: signals → per-key XOR → Al →
  self-XOR envelope → wire.**
- Plaintext fragments we DID capture at the boundary (proving signals are
  client-assembled): `{"adb":0,"crs":1,"asib":0}` (adblock/consent/resize
  flags) and the UA-CH brands arrays — plus the full **response** JSON (the
  `visitor_id`/`event_id`/`suspect_score`) which is readable.

## 3. Tamper differential (the goal) — server accepts changed signals

| Run | Client signals | visitor_id | suspect_score |
|---|---|---|---|
| clean | headless Linux, 12 cores, 1280×900, en-US | `SO22bXJzkmCItm0BYYzJ` | 37 |
| tampered | Mac UA, 16 cores, 64GB, 2560×1440, 30-bit, fr-FR | **`D4m9xkMf0RwGUp1SNP7T`** | **51** |

- The spoofed request was **accepted** (HTTP 200) and the server **minted a
  different `visitor_id`**.
- So: **you can change what's shipped and the server accepts it** — you get a
  **fresh synthetic identity** (the classic account-farming / history-fragment
  play). The `suspect_score` even *increased* (37→51) — the server's model
  penalized the more "perfect" Mac profile, a nice sign the scoring is
  server-side and subtle.

## 4. The honest boundary (what we cannot do)

- We **cannot decrypt the full request envelope to plaintext JSON** — it's
  multi-layer encrypted (per-signal keys + `Al` + self-XOR), and the keys are
  derived per-request inside the closure. This is genuinely stronger than the
  prior assessment's single-XOR note.
- We **cannot mint a specific victim's `visitor_id`** — the ID is server-owned:
  a spoofed signal set yields a *different* synthetic ID, not a replayed
  target. The signed `_vid_` cookie + IP/TLS context + server model bind the ID.
- We **can** read the signals the client assembles, ship modified signals, and
  get a fresh accepted identity — the account-farming path, not identity theft.

## 5. How it compares (updated)

| Vendor | Payload plaintext? | Tamper accepted? | Mint *specific* ID? |
|---|---|---|---|
| Fingerprint Pro | **No** (multi-layer encrypted envelope) | **Yes → fresh synthetic ID** | **No** (server-owned) |
| TikTok | Yes (readable at boundary) | Yes (runner mints X-Gnarly) | n/a (per-request sig) |
| Binance | Yes (`__BNC_FP_INFO__`) | Yes (fingerprint flips) | Yes (fresh device) |
| hCaptcha | No (encrypted, context-gated) | No (challenge required) | No |

Fingerprint Pro is the **strongest of the "client-ships-signals" vendors**: its
request is genuinely encrypted and its identity is server-owned — but it is
not a boundary (fresh synthetic IDs are mintable, exactly as the tamper run
shows).

## 6. Artifacts

| File | What |
|---|---|
| `scripts/fp-probe*.mjs` | live loader/agent probes |
| `scripts/fp-plaintext.mjs` | JSON.stringify boundary capture |
| `scripts/fp-al-hook*.mjs` | Al()/pE() instrumentation |
| `scripts/fp-tamper.mjs` | clean vs tampered differential |
| `artifacts/real-result.json` | real API response (visitor_id etc.) |
| `artifacts/tamper-results.json` | the differential (SO22… vs D4m9…) |
| `artifacts/payload.b64` | the 3,273B encrypted request envelope |
| `artifacts/plaintext-caps.json` | plaintext fragments (consent flags, UA-CH) |
| `artifacts/al-caps*.json` | Al() layer captures |
| `assets/v4.js` | the real v4 loader (from CDN, live key) |

## 7. Summary line

> *"With a live key, Fingerprint Pro works end-to-end: the real agent posts a
> genuinely multi-layer-encrypted request (per-signal keys + `Al` XOR +
> self-XOR envelope — not decryptable to plaintext), and the `visitor_id` is
> server-computed. But the tamper test is decisive: spoofed client signals are
> accepted and yield a different `visitor_id` — you can change what's shipped
> and get a fresh synthetic identity. You cannot mint a specific target's ID;
> the identity is server-owned. Client-readable, server-decided, synthetic-
> mintable."*
