#!/usr/bin/env python3
"""
PureFusion Feed — ESLint runner
Checks that Node/npm/ESLint are available, installs deps if needed,
then lints purefusion-feed/src/.
"""

import subprocess
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC  = ROOT / 'purefusion-feed' / 'src'
NM   = ROOT / 'node_modules'
PKG  = ROOT / 'package.json'

CYAN   = '\033[96m'
GREEN  = '\033[92m'
YELLOW = '\033[93m'
RED    = '\033[91m'
RESET  = '\033[0m'


def step(msg):
    print(f'{CYAN}→{RESET} {msg}')


def ok(msg):
    print(f'{GREEN}✓{RESET} {msg}')


def warn(msg):
    print(f'{YELLOW}⚠{RESET}  {msg}')


def err(msg):
    print(f'{RED}✗{RESET} {msg}', file=sys.stderr)


def require_tool(name):
    path = shutil.which(name)
    if not path:
        err(f'{name} not found — install Node.js from https://nodejs.org')
        sys.exit(1)
    return path


def main():
    fix_mode = '--fix' in sys.argv
    files_arg = next((a for a in sys.argv[1:] if not a.startswith('-')), None)

    step('Checking environment...')
    node = require_tool('node')
    npm  = require_tool('npm')

    node_ver = subprocess.check_output([node, '--version'], text=True).strip()
    npm_ver  = subprocess.check_output([npm, '--version'],  text=True).strip()
    ok(f'Node {node_ver}  npm v{npm_ver}')

    # Install devDependencies if node_modules is missing
    if not NM.exists():
        step('node_modules not found — running npm install...')
        result = subprocess.run(['npm', 'install', '--silent'], cwd=ROOT)
        if result.returncode != 0:
            err('npm install failed')
            sys.exit(result.returncode)
        ok('Dependencies installed')
    else:
        ok('node_modules present')

    # Build ESLint command
    eslint = NM / '.bin' / ('eslint.cmd' if sys.platform == 'win32' else 'eslint')
    target = files_arg or str(SRC / '**' / '*.js')

    cmd = [str(eslint), target, '--color']
    if fix_mode:
        cmd.append('--fix')
        warn('Running in --fix mode — files will be modified')

    step(f'Running ESLint on {target}')
    print()

    result = subprocess.run(cmd, cwd=ROOT)
    print()

    if result.returncode == 0:
        ok('No ESLint errors found')
    elif result.returncode == 1:
        err('ESLint found problems — fix the errors above and re-run')
    else:
        err(f'ESLint exited with code {result.returncode}')

    sys.exit(result.returncode)


if __name__ == '__main__':
    main()
