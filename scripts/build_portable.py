"""Compatibilidade: o build compartilhado usa Node, disponível também na Vercel."""
from pathlib import Path
import subprocess

subprocess.run(['node', str(Path(__file__).with_suffix('.mjs'))], check=True)
