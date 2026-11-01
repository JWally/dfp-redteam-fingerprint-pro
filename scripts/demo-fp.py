#!/usr/bin/env python3
"""demo-fp.py — print the FULL Fingerprint Pro shipped payload (plaintext).
Replays the captured 153-signal JSON (captured at the QK/XOR-seal boundary
from the live loader with the public browser key)."""
import json, sys

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/opencode/fp/qk-plain-0.json'
    d = json.load(open(src))
    print('=' * 74)
    print('FINGERPRINT PRO — FULL SHIPPED PAYLOAD (plaintext at QK boundary)')
    print('capture: 153 keys / 9401 B / deflate-raw decompressed')
    print('seal: kl(payload, KE=[3,14], JE=3, xE=9) — in-band XOR key')
    print('=' * 74)
    print(json.dumps(d, indent=1, default=str))
    print('=' * 74)
    n = sum(1 for v in d.values() if isinstance(v, dict) and v.get('s') == 0)
    print(f'KEYS: {len(d)} total | {n} signals with values | apiKey={d.get("c")}')

if __name__ == '__main__':
    main()
