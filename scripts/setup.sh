#!/bin/sh
set -eu
cd /workspace/RIP
command -v node >/dev/null
mkdir -p .data
python3 -m unittest discover -s tests -v
node tests/receipt.test.js
node tests/validation.test.js
node scripts/build_portable.mjs
node scripts/build_portable.mjs --vercel
