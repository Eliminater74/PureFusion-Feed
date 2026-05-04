#!/usr/bin/env python3
"""
build_release.py — PureFusion Feed Release Builder

1. Reads the current version from manifest.json
2. Verifies all version-bearing files agree (same check surface as bump_version.py)
3. Zips purefusion-feed/ (excluding dev/doc files) into a dated, version-stamped zip
4. Prints the SHA-256 hash of the produced zip for integrity verification

Run without arguments to see full usage.
"""

import hashlib
import json
import os
import re
import sys
import zipfile
import argparse
from datetime import date
from pathlib import Path

# Force UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ─── ANSI colours (same pattern as bump_version.py) ──────────────────────────
if sys.platform == "win32":
    try:
        import ctypes
        _k32  = ctypes.windll.kernel32
        _h    = _k32.GetStdHandle(-11)
        _mode = ctypes.c_ulong()
        _k32.GetConsoleMode(_h, ctypes.byref(_mode))
        _k32.SetConsoleMode(_h, _mode.value | 0x0004)
    except Exception:
        pass

def _tty():
    return hasattr(sys.stdout, "isatty") and sys.stdout.isatty()

RESET  = "\033[0m"  if _tty() else ""
BOLD   = "\033[1m"  if _tty() else ""
DIM    = "\033[2m"  if _tty() else ""
GREEN  = "\033[32m" if _tty() else ""
YELLOW = "\033[33m" if _tty() else ""
CYAN   = "\033[36m" if _tty() else ""
RED    = "\033[31m" if _tty() else ""

def _ok(msg):   print(f"  {GREEN}✔{RESET}  {msg}")
def _warn(msg): print(f"  {YELLOW}⚠{RESET}  {msg}")
def _skip(msg): print(f"  {DIM}–  {msg}{RESET}")
def _err(msg):  print(f"  {RED}✘{RESET}  {msg}", file=sys.stderr)
def _head(msg): print(f"\n  {BOLD}{msg}{RESET}")
def _rule():    print(f"  {DIM}{'─' * 54}{RESET}")


# ─── Path resolution (mirrors bump_version.py) ───────────────────────────────
_SCRIPT_DIR = Path(__file__).resolve().parent
_EXT_ROOT   = (_SCRIPT_DIR / ".." / "purefusion-feed").resolve()
_REPO_ROOT  = (_SCRIPT_DIR / "..").resolve()

def _ext(rel):
    return (_EXT_ROOT / rel).resolve()

def _repo(rel):
    return (_REPO_ROOT / rel).resolve()


# ─── Version consistency registry ────────────────────────────────────────────
# Mirrors the file list in bump_version.py so both tools stay in sync.
def _build_checks(version):
    return [
        {
            "label":   "manifest.json",
            "path":    _ext("manifest.json"),
            "kind":    "json",
            "key":     "version",
        },
        {
            "label":   "README.md (extension)",
            "path":    _ext("README.md"),
            "kind":    "regex",
            "pattern": re.compile(r"PureFusion Feed v(\d+\.\d+\.\d+)"),
        },
        {
            "label":   "README.md (repo root)",
            "path":    _repo("README.md"),
            "kind":    "regex",
            "pattern": re.compile(r"PureFusion Feed v(\d+\.\d+\.\d+)"),
        },
        {
            "label":   "CHROME_STORE_LISTING.md",
            "path":    _ext("CHROME_STORE_LISTING.md"),
            "kind":    "regex",
            "pattern": re.compile(r"PureFusion Feed v(\d+\.\d+\.\d+)"),
        },
        {
            "label":   "popup.html version badge",
            "path":    _ext("src/popup/popup.html"),
            "kind":    "regex",
            "pattern": re.compile(r'pf-version">v(\d+\.\d+\.\d+)'),
        },
        {
            "label":   "welcome.html version badge",
            "path":    _ext("src/welcome/welcome.html"),
            "kind":    "regex",
            "pattern": re.compile(r'pf-welcome-version"[^>]*>v(\d+\.\d+\.\d+)'),
        },
    ]


# ─── Files / patterns excluded from the release zip ──────────────────────────
# These are dev/docs files that Chrome does not need and the Web Store
# reviewer doesn't need to see inside the package.
_EXCLUDE_NAMES = {
    ".gitignore",
    "CHANGELOG.md",
    "CHROME_STORE_LISTING.md",
    "PRIVACY_POLICY.md",
    "README.md",
    "PLUGIN_SDK_ROADMAP.md",
    "FBPURITY_PARITY_TODO.md",
}

def _should_exclude(rel_path: str) -> bool:
    name = Path(rel_path).name
    return name in _EXCLUDE_NAMES


# ─── Core helpers ─────────────────────────────────────────────────────────────
def _read_version_from_manifest():
    manifest_path = _ext("manifest.json")
    if not manifest_path.exists():
        _err(f"manifest.json not found at: {manifest_path}")
        _err("Check that purefusion-feed/ exists next to the scripts/ folder.")
        sys.exit(1)
    with open(manifest_path, encoding="utf-8") as f:
        return json.load(f).get("version", "0.0.0")


def _verify_version_consistency(version):
    checks = _build_checks(version)
    ok_count   = 0
    skip_count = 0
    fail_count = 0

    for c in checks:
        path = c["path"]
        label = c["label"]

        if not path.exists():
            _skip(f"{label:<44} (file not found)")
            skip_count += 1
            continue

        if c["kind"] == "json":
            with open(path, encoding="utf-8") as f:
                found = json.load(f).get(c["key"], "")
        else:
            text  = path.read_text(encoding="utf-8")
            match = c["pattern"].search(text)
            found = match.group(1) if match else None

        if found is None:
            _warn(f"{label:<44} {DIM}pattern not found in file{RESET}")
            fail_count += 1
        elif found != version:
            _err(f"{label:<44} {RED}has {found!r}, expected {version!r}{RESET}")
            fail_count += 1
        else:
            _ok(f"{label:<44} {DIM}v{found}{RESET}")
            ok_count += 1

    return ok_count, skip_count, fail_count


def _collect_files(root: Path):
    """Yield (archive_name, absolute_path) for every file to include in the zip."""
    for abs_path in sorted(root.rglob("*")):
        if not abs_path.is_file():
            continue
        rel = abs_path.relative_to(root)
        rel_str = rel.as_posix()
        if _should_exclude(rel_str):
            continue
        # Archive path = purefusion-feed/<rel> so it unzips into its own folder
        yield str(Path("purefusion-feed") / rel), abs_path


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _build_zip(version: str, output_dir: Path, dry_run: bool):
    today    = date.today().strftime("%Y%m%d")
    zip_name = f"purefusion-feed-v{version}-{today}.zip"
    zip_path = output_dir / zip_name

    files = list(_collect_files(_EXT_ROOT))

    _head("Packaging")
    _rule()
    print(f"  Output : {DIM}{zip_path}{RESET}")
    print(f"  Files  : {len(files)} items from purefusion-feed/")

    excluded = [
        name for name in _EXCLUDE_NAMES
        if (_EXT_ROOT / name).exists()
    ]
    if excluded:
        print(f"  Excluded: {DIM}{', '.join(sorted(excluded))}{RESET}")
    print()

    if dry_run:
        for arc_name, _ in files:
            print(f"    {DIM}{arc_name}{RESET}")
        return None

    if zip_path.exists():
        _warn(f"Overwriting existing file: {zip_name}")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for arc_name, abs_path in files:
            zf.write(abs_path, arc_name)

    return zip_path


def _help_banner(version):
    return f"""
{BOLD}{CYAN}build_release.py{RESET} {DIM}— PureFusion Feed Release Builder{RESET}
{DIM}{'─' * 54}{RESET}

{BOLD}Current version:{RESET} {YELLOW}{version}{RESET}
{BOLD}Extension root: {RESET} {DIM}{_EXT_ROOT}{RESET}
{BOLD}Output default: {RESET} {DIM}{_REPO_ROOT}{RESET}

{BOLD}Usage:{RESET}
  python scripts/build_release.py {YELLOW}[options]{RESET}

{BOLD}Options:{RESET}
  {YELLOW}--output {DIM}DIR{RESET}     Write zip to DIR instead of repo root
  {YELLOW}--skip-verify{RESET}   Skip version consistency check
  {YELLOW}--dry-run{RESET}       Show what would be zipped — write nothing
  {YELLOW}--help{RESET}          Show this message

{BOLD}What it does:{RESET}
  {GREEN}1{RESET} Reads version from manifest.json
  {GREEN}2{RESET} Verifies all version badges match (same files as bump_version.py)
  {GREEN}3{RESET} Zips purefusion-feed/ → purefusion-feed-vX.Y.Z-YYYYMMDD.zip
  {GREEN}4{RESET} Prints SHA-256 hash of the produced zip

{BOLD}Excluded from zip:{RESET}
  {DIM}.gitignore, CHANGELOG.md, CHROME_STORE_LISTING.md, FBPURITY_PARITY_TODO.md,
  PLUGIN_SDK_ROADMAP.md, PRIVACY_POLICY.md, README.md{RESET}
"""


# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    version = _read_version_from_manifest()

    parser = argparse.ArgumentParser(
        prog="build_release.py",
        description="PureFusion Feed release builder",
        add_help=False,
    )
    parser.add_argument("--output",      metavar="DIR", default=str(_REPO_ROOT))
    parser.add_argument("--skip-verify", action="store_true")
    parser.add_argument("--dry-run",     action="store_true")
    parser.add_argument("--help",        action="store_true")
    args = parser.parse_args()

    if args.help:
        print(_help_banner(version))
        sys.exit(0)

    output_dir = Path(args.output).resolve()
    if not output_dir.exists():
        _err(f"Output directory does not exist: {output_dir}")
        sys.exit(1)

    dry_label = f"  {YELLOW}DRY RUN — nothing will be written{RESET}" if args.dry_run else ""

    print()
    print(f"  {BOLD}PureFusion Feed — Build Release{RESET}{dry_label}")
    _rule()
    print(f"  Version: {BOLD}{YELLOW}{version}{RESET}")
    print()

    # ── Step 1: Version consistency ──────────────────────────────────────────
    if not args.skip_verify:
        _head("Version Consistency Check")
        _rule()
        ok_count, skip_count, fail_count = _verify_version_consistency(version)
        print()

        if fail_count > 0:
            _err(f"{fail_count} file(s) have a version mismatch.")
            _err("Run bump_version.py to fix, or use --skip-verify to force.")
            sys.exit(1)

        _ok(f"All {ok_count} checked file(s) agree on v{version}")
    else:
        _warn("Skipping version consistency check (--skip-verify)")

    # ── Step 2: Build zip ────────────────────────────────────────────────────
    zip_path = _build_zip(version, output_dir, args.dry_run)

    if args.dry_run:
        print()
        _warn("Dry run complete. Remove --dry-run to produce the zip.")
        print()
        sys.exit(0)

    # ── Step 3: SHA-256 ──────────────────────────────────────────────────────
    _head("Integrity")
    _rule()
    digest = _sha256(zip_path)
    size_kb = zip_path.stat().st_size / 1024
    _ok(f"{'File':<10} {zip_path.name}")
    _ok(f"{'Size':<10} {size_kb:.1f} KB")
    _ok(f"{'SHA-256':<10} {DIM}{digest}{RESET}")

    print()
    print(f"  {GREEN}{BOLD}Done.{RESET}  Upload {BOLD}{zip_path.name}{RESET} to the Chrome Web Store.")
    print()


if __name__ == "__main__":
    main()
