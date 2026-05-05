#!/usr/bin/env python3
"""
bump_version.py — PureFusion Feed Version Manager

Bumps the version string consistently across every file that embeds it,
prepends a new CHANGELOG entry, and reports a clear per-file summary.

Can be run from any directory — paths are resolved relative to this script's
location (Extension/scripts/ → Extension/purefusion-feed/).

Run without arguments to see full usage.
"""

import json
import re
import os
import sys
import argparse
from datetime import date

# Force UTF-8 output so box-drawing / tick characters render correctly on Windows.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ─────────────────────────────────────────────────────────────────────────────
# ANSI colour helpers
# Windows Terminal / PowerShell support VT100 natively; enable for legacy cmd.
# ─────────────────────────────────────────────────────────────────────────────
if sys.platform == "win32":
    try:
        import ctypes
        _k32  = ctypes.windll.kernel32
        _h    = _k32.GetStdHandle(-11)          # STD_OUTPUT_HANDLE
        _mode = ctypes.c_ulong()
        _k32.GetConsoleMode(_h, ctypes.byref(_mode))
        _k32.SetConsoleMode(_h, _mode.value | 0x0004)   # ENABLE_VIRTUAL_TERMINAL_PROCESSING
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
def _err(msg):  print(f"  {RED}✘{RESET}  {msg}")


# ─────────────────────────────────────────────────────────────────────────────
# Root path resolution
#
# Script lives at:  Extension/scripts/bump_version.py
# Extension root:   Extension/purefusion-feed/
# Repo root:        Extension/
# ─────────────────────────────────────────────────────────────────────────────
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_EXT_ROOT   = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", "purefusion-feed"))
_REPO_ROOT  = os.path.normpath(os.path.join(_SCRIPT_DIR, ".."))


def _abs(rel: str) -> str:
    """Resolve a path that is relative to the extension root (purefusion-feed/)."""
    return os.path.normpath(os.path.join(_EXT_ROOT, rel))


def _repo(rel: str) -> str:
    """Resolve a path that is relative to the repo root (Extension/)."""
    return os.path.normpath(os.path.join(_REPO_ROOT, rel))


# ─────────────────────────────────────────────────────────────────────────────
# File registry
#
# Each tuple: (display_label, resolved_absolute_path, regex_or_None)
# Entries with regex=None are handled by specialised code in main().
# ─────────────────────────────────────────────────────────────────────────────
def _build_registry():
    return [
        ("manifest.json",               _abs("manifest.json"),               None),
        ("README.md",                   _abs("README.md"),                   re.compile(r"(PureFusion Feed v)\d+\.\d+\.\d+")),
        ("../README.md",                _repo("README.md"),                  re.compile(r"(PureFusion Feed v)\d+\.\d+\.\d+")),
        ("CHROME_STORE_LISTING.md",     _abs("CHROME_STORE_LISTING.md"),     re.compile(r"(PureFusion Feed v)\d+\.\d+\.\d+")),
        ("src/popup/popup.html",        _abs("src/popup/popup.html"),        re.compile(r'(pf-version">v)\d+\.\d+\.\d+')),
        ("src/welcome/welcome.html",    _abs("src/welcome/welcome.html"),    re.compile(r'(pf-welcome-version" class="badge">v)\d+\.\d+\.\d+')),
        ("CHANGELOG.md",                _abs("CHANGELOG.md"),                None),
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Changelog templates
# ─────────────────────────────────────────────────────────────────────────────
_CHANGELOG_SKELETON = """\
## v{version} - {today}

### Added
-

### Fixed
-

### Changed
-

---

"""

_CHANGELOG_WITH_NOTE = """\
## v{version} - {today}

### Changed
- {note}

---

"""


# ─────────────────────────────────────────────────────────────────────────────
# Help banner (printed when no arguments are supplied)
# ─────────────────────────────────────────────────────────────────────────────
def _help_banner(current_version: str) -> str:
    p = current_version.split(".")
    patch_ex = f"{p[0]}.{p[1]}.{int(p[2])+1}"
    minor_ex  = f"{p[0]}.{int(p[1])+1}.0"
    major_ex  = f"{int(p[0])+1}.0.0"

    return f"""
{BOLD}{CYAN}bump_version.py{RESET} {DIM}— PureFusion Feed Version Manager{RESET}
{DIM}{'─' * 54}{RESET}

{BOLD}Current version:{RESET} {YELLOW}{current_version}{RESET}
{BOLD}Extension root: {RESET} {DIM}{_EXT_ROOT}{RESET}

{BOLD}Usage:{RESET}
  python scripts/bump_version.py {CYAN}<command>{RESET} {YELLOW}[options]{RESET}

{BOLD}Commands:{RESET}
  {CYAN}--patch{RESET}            Bump patch   {DIM}({current_version} → {patch_ex}){RESET}
  {CYAN}--minor{RESET}            Bump minor   {DIM}({current_version} → {minor_ex}){RESET}
  {CYAN}--major{RESET}            Bump major   {DIM}({current_version} → {major_ex}){RESET}
  {CYAN}--set {YELLOW}X.Y.Z{RESET}        Set an explicit version number

{BOLD}Options:{RESET}
  {YELLOW}--note {DIM}"text"{RESET}     One-line summary written into CHANGELOG.md
  {YELLOW}--dry-run{RESET}          Preview every change — nothing is written
  {YELLOW}--verify{RESET}           After bump, scan all source files for any remaining
                     occurrences of the OLD version string. Warns about files
                     not in the registry that may need to be added.
  {YELLOW}--list-files{RESET}       Print the registry (all files this script updates)
                     with current version status — write nothing.
  {YELLOW}--help{RESET}             Show this message

{BOLD}Examples:{RESET}
  python scripts/bump_version.py --patch
  python scripts/bump_version.py --patch --verify
  python scripts/bump_version.py --minor --dry-run
  python scripts/bump_version.py --set 2.0.0 --note "Complete rewrite"
  python scripts/bump_version.py --list-files

{BOLD}Files updated automatically:{RESET}
  {GREEN}●{RESET} manifest.json                   {DIM}("version" JSON field){RESET}
  {GREEN}●{RESET} README.md                       {DIM}(extension readme title){RESET}
  {GREEN}●{RESET} ../README.md                    {DIM}(repo-root readme title, if present){RESET}
  {GREEN}●{RESET} CHROME_STORE_LISTING.md         {DIM}(store listing title){RESET}
  {GREEN}●{RESET} CHANGELOG.md                    {DIM}(new release entry prepended){RESET}
  {GREEN}●{RESET} src/popup/popup.html            {DIM}(#pf-version badge){RESET}
  {GREEN}●{RESET} src/welcome/welcome.html        {DIM}(#pf-welcome-version badge){RESET}

  All paths are resolved relative to:
  {DIM}{_EXT_ROOT}{RESET}
"""


# ─────────────────────────────────────────────────────────────────────────────
# Core helpers
# ─────────────────────────────────────────────────────────────────────────────
def _parse_version(v: str) -> list:
    parts = v.strip().split(".")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise ValueError(f"Invalid version '{v}' — expected MAJOR.MINOR.PATCH (e.g. 1.8.1)")
    return list(map(int, parts))


def _fmt(parts: list) -> str:
    return ".".join(map(str, parts))


def _update_text_file(path: str, pattern: re.Pattern, new_version: str, dry_run: bool):
    """Regex-replace version string in a text file. Returns (changed, match_count)."""
    with open(path, "r", encoding="utf-8") as f:
        original = f.read()

    replacement = r"\g<1>" + new_version
    updated, count = pattern.subn(replacement, original)

    if count == 0:
        return False, 0
    if not dry_run:
        with open(path, "w", encoding="utf-8") as f:
            f.write(updated)
    return True, count


def _prepend_changelog(path: str, new_section: str, dry_run: bool) -> bool:
    """Prepend a new release section immediately before the first ## v… entry."""
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    match = re.search(r"\n(## v\d+\.\d+\.\d+)", content)
    if match:
        pos = match.start() + 1          # keep leading newline, insert before ##
        updated = content[:pos] + new_section + content[pos:]
    else:
        updated = content.rstrip("\n") + "\n\n" + new_section

    if not dry_run:
        with open(path, "w", encoding="utf-8") as f:
            f.write(updated)
    return True


# ─────────────────────────────────────────────────────────────────────────────
# --list-files helper
# ─────────────────────────────────────────────────────────────────────────────
def _do_list_files(registry, current_version):
    print()
    print(f"  {BOLD}Registry — files updated by bump_version.py{RESET}")
    print(f"  {DIM}{'─' * 52}{RESET}")
    ver_re = re.compile(re.escape(current_version))
    for label, full_path, _pat in registry:
        if not os.path.exists(full_path):
            _skip(f"{label:<44} (file not found)")
            continue
        if label == "manifest.json":
            with open(full_path, encoding="utf-8") as f:
                found_ver = json.load(f).get("version", "")
            marker = f"{DIM}v{found_ver}{RESET}" if found_ver == current_version else f"{RED}v{found_ver} — mismatch!{RESET}"
            _ok(f"{label:<44} {marker}")
        elif _pat is not None:
            text = open(full_path, encoding="utf-8").read()
            m = _pat.search(text)
            found_ver = m.group(0).split("v")[-1] if m else None
            if found_ver == current_version:
                _ok(f"{label:<44} {DIM}v{found_ver}{RESET}")
            elif found_ver:
                _err(f"{label:<44} {RED}v{found_ver} — mismatch!{RESET}")
            else:
                _warn(f"{label:<44} {DIM}pattern not found{RESET}")
        else:
            # CHANGELOG — just confirm it exists
            _ok(f"{label:<44} {DIM}(exists){RESET}")
    print()


# ─────────────────────────────────────────────────────────────────────────────
# --verify helper
# ─────────────────────────────────────────────────────────────────────────────
_VERIFY_SKIP_DIRS  = {".git", "node_modules", "__pycache__", "TEMP", "temp",
                      ".opencode", ".claude", ".vscode", ".idea"}
_VERIFY_SKIP_EXTS  = {".zip", ".crx", ".pem", ".png", ".ico", ".jpg", ".jpeg",
                      ".svg", ".woff", ".woff2", ".ttf", ".pyc", ".pyo",
                      ".lock", ".map"}

def _scan_for_version(ver, skip_dirs=_VERIFY_SKIP_DIRS, skip_exts=_VERIFY_SKIP_EXTS):
    """Walk the repo and return a list of (fpath, line_number) for each hit."""
    ver_re = re.compile(re.escape(ver))
    hits = []
    scan_roots = [_EXT_ROOT, _REPO_ROOT]
    visited = set()
    for root_dir in scan_roots:
        for dirpath, dirnames, filenames in os.walk(root_dir):
            dirnames[:] = [d for d in dirnames if d not in skip_dirs]
            for fname in filenames:
                ext = os.path.splitext(fname)[1].lower()
                if ext in skip_exts:
                    continue
                fpath = os.path.normpath(os.path.join(dirpath, fname))
                if fpath in visited:
                    continue
                visited.add(fpath)
                try:
                    with open(fpath, encoding="utf-8", errors="ignore") as f:
                        text = f.read()
                except OSError:
                    continue
                if ver_re.search(text):
                    hits.append(fpath)
    return hits


def _do_verify(old_ver, registry):
    """Scan every text file in the repo for the old (pre-bump) version string.

    Files in the registry are expected to have had it replaced already — any
    remaining hit is an error.  Files outside the registry that still contain
    the old string are flagged so the developer can decide whether to add them.
    """
    registry_paths = {os.path.normpath(p) for _, p, _ in registry}
    hits = _scan_for_version(old_ver)

    print()
    print(f"  {BOLD}Verify — scanning for remaining '{old_ver}' occurrences{RESET}")
    print(f"  {DIM}{'─' * 52}{RESET}")

    unregistered = [p for p in hits if p not in registry_paths]
    registry_still = [p for p in hits if p in registry_paths]

    if registry_still:
        for p in registry_still:
            _err(f"Registry file still has old version: {DIM}{p}{RESET}")

    if unregistered:
        for p in unregistered:
            _warn(f"Unregistered file contains '{old_ver}': {DIM}{p}{RESET}")
        print()
        _warn(f"{len(unregistered)} file(s) outside the registry contain '{old_ver}'.")
        _warn("Add them to _build_registry() in bump_version.py if they embed the version.")
    elif not registry_still:
        _ok(f"No files contain the old version string '{old_ver}'.")

    print()
    return len(registry_still) == 0


def _do_verify_standalone(current_ver, registry):
    """Standalone --verify (no bump): report any file that contains the current
    version string but is NOT in the registry.  These are candidates to add."""
    registry_paths = {os.path.normpath(p) for _, p, _ in registry}
    hits = _scan_for_version(current_ver)

    unregistered = [p for p in hits if p not in registry_paths]

    print()
    print(f"  {BOLD}Verify — files containing '{current_ver}' outside the registry{RESET}")
    print(f"  {DIM}{'─' * 52}{RESET}")

    if unregistered:
        for p in unregistered:
            _warn(f"Contains version but not in registry: {DIM}{p}{RESET}")
        print()
        _warn("These files embed the version string but bump_version.py will NOT update them.")
        _warn("Add them to _build_registry() if they should be bumped automatically.")
    else:
        _ok(f"All files containing '{current_ver}' are in the registry. Nothing to add.")
    print()


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    registry = _build_registry()

    # Locate manifest to read current version
    manifest_path = _abs("manifest.json")
    if not os.path.exists(manifest_path):
        _err(f"manifest.json not found at: {manifest_path}")
        _err("Check that purefusion-feed/ exists next to the scripts/ folder.")
        sys.exit(1)

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    current_version = manifest.get("version", "0.0.0")

    # No args → help
    if len(sys.argv) == 1:
        print(_help_banner(current_version))
        sys.exit(0)

    # Argument parsing
    parser = argparse.ArgumentParser(
        prog="bump_version.py",
        description="PureFusion Feed version bumper",
        add_help=False,
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--patch",      action="store_true")
    group.add_argument("--minor",      action="store_true")
    group.add_argument("--major",      action="store_true")
    group.add_argument("--set",        metavar="X.Y.Z")
    parser.add_argument("--dry-run",   action="store_true")
    parser.add_argument("--note",      metavar="TEXT")
    parser.add_argument("--verify",    action="store_true")
    parser.add_argument("--list-files", action="store_true", dest="list_files")
    parser.add_argument("--help",      action="store_true")
    args = parser.parse_args()

    if args.help:
        print(_help_banner(current_version))
        sys.exit(0)

    # --list-files: standalone mode — no bump needed
    if args.list_files:
        _do_list_files(registry, current_version)
        sys.exit(0)

    # --verify standalone (no bump command): check the current version
    if args.verify and not any([args.patch, args.minor, args.major, args.set]):
        _do_verify_standalone(current_version, registry)
        sys.exit(0)

    if not any([args.patch, args.minor, args.major, args.set]):
        _err("No command given. Run without arguments to see full usage.")
        sys.exit(1)

    # Compute new version
    try:
        parts = _parse_version(current_version)
    except ValueError as e:
        _err(str(e))
        sys.exit(1)

    if args.set:
        try:
            new_parts = _parse_version(args.set)
        except ValueError as e:
            _err(str(e))
            sys.exit(1)
    else:
        new_parts = parts[:]
        if args.major:
            new_parts[0] += 1; new_parts[1] = 0; new_parts[2] = 0
        elif args.minor:
            new_parts[1] += 1; new_parts[2] = 0
        elif args.patch:
            new_parts[2] += 1

    old_ver = _fmt(parts)
    new_ver = _fmt(new_parts)

    if old_ver == new_ver:
        _warn(f"Version is already {old_ver} — nothing to do.")
        sys.exit(0)

    # Header
    print()
    mode_label = f"{YELLOW}DRY RUN — no files will be written{RESET}" if args.dry_run else "Writing changes..."
    print(f"  {BOLD}PureFusion Feed — Version Bump{RESET}  {DIM}({mode_label}){RESET}")
    print(f"  {DIM}{'─' * 52}{RESET}")
    print(f"  {BOLD}{old_ver}{RESET}  {CYAN}→{RESET}  {BOLD}{GREEN}{new_ver}{RESET}")
    print()

    # manifest.json (JSON-aware)
    manifest["version"] = new_ver
    if not args.dry_run:
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
            f.write("\n")
    _ok(f"{'manifest.json':<40} {DIM}{old_ver} → {new_ver}{RESET}")

    # Text files
    for label, full_path, pattern in registry:
        if pattern is None:
            continue    # manifest and changelog handled separately

        if not os.path.exists(full_path):
            _skip(f"{label:<40} (not found)")
            continue

        changed, count = _update_text_file(full_path, pattern, new_ver, args.dry_run)
        if changed:
            _ok(f"{label:<40} {DIM}{count} match(es) replaced{RESET}")
        else:
            _warn(f"{label:<40} {DIM}pattern not matched — check manually{RESET}")

    # CHANGELOG.md
    changelog_path = _abs("CHANGELOG.md")
    if os.path.exists(changelog_path):
        today = date.today().isoformat()
        if args.note:
            section  = _CHANGELOG_WITH_NOTE.format(version=new_ver, today=today, note=args.note.strip())
            cl_label = "(with note)"
        else:
            section  = _CHANGELOG_SKELETON.format(version=new_ver, today=today)
            cl_label = "skeleton — fill in manually"

        _prepend_changelog(changelog_path, section, args.dry_run)
        _ok(f"{'CHANGELOG.md':<40} {DIM}{cl_label}{RESET}")
    else:
        _skip("CHANGELOG.md                             (not found)")

    # Footer
    print()
    if args.dry_run:
        print(f"  {YELLOW}Dry run complete.{RESET} Remove {BOLD}--dry-run{RESET} to apply changes.")
    else:
        print(f"  {GREEN}{BOLD}Done.{RESET} Version bumped {old_ver} → {new_ver}")
        if not args.note:
            print(f"  {DIM}Tip: fill in the CHANGELOG.md entry for v{new_ver} before committing.{RESET}")
    print()

    # --verify: scan for any remaining old-version strings after the bump
    if args.verify and not args.dry_run:
        _do_verify(old_ver, registry)


if __name__ == "__main__":
    main()
