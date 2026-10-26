#!/bin/sh
set -eu
cd /workspace/RIP
command -v tesseract >/dev/null || { echo 'Instale tesseract-ocr antes de continuar.' >&2; exit 1; }
mkdir -p .data/tessdata
if [ ! -f .data/venv/bin/python ]; then
    python3 -m venv .data/venv --system-site-packages
fi
.data/venv/bin/python -m pip install --disable-pip-version-check --no-cache-dir -r requirements.txt
if [ ! -f .data/tessdata/por.traineddata ]; then
    curl --fail --location --max-time 120 https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/por.traineddata -o .data/tessdata/por.traineddata.tmp
    echo 'c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb  .data/tessdata/por.traineddata.tmp' | sha256sum -c -
    mv .data/tessdata/por.traineddata.tmp .data/tessdata/por.traineddata
fi
echo 'c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb  .data/tessdata/por.traineddata' | sha256sum -c -
.data/venv/bin/python -m unittest discover -s tests -v
if command -v node >/dev/null; then
    node tests/receipt.test.js
fi
