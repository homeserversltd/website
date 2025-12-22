#!/usr/bin/env python3
"""
Post-build premium tab restoration helper.

Replays premium tab installer file operations in batch mode (no rebuild/restart)
so blueprint injections and backend assets survive React builds.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict, List


def log(message: str) -> None:
    print(f"[post-build-tabs] {message}")


def load_tab_manifests(premium_dir: Path) -> Dict[str, Path]:
    """Return mapping of manifest tab names to their directory paths."""
    mapping: Dict[str, Path] = {}

    for child in premium_dir.iterdir():
        if not child.is_dir():
            continue
        if child.name == "utils":
            continue

        manifest = child / "index.json"
        if not manifest.exists():
            continue

        try:
            with manifest.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            tab_name = data.get("name") or child.name
            mapping[tab_name] = child
        except Exception as exc:
            log(f"warning: failed to read manifest for {child}: {exc}")

    return mapping


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    premium_dir = script_dir.parent
    installer_path = premium_dir / "installer.py"

    if not installer_path.exists():
        log("installer.py not found – skipping premium tab restoration")
        return 0

    sys.path.insert(0, str(premium_dir))

    try:
        from installer import PremiumInstaller  # type: ignore
    except Exception as exc:  # pragma: no cover
        log(f"error: unable to import PremiumInstaller: {exc}")
        return 1

    installer = PremiumInstaller()

    try:
        installed_tabs = installer.get_installed_premium_tabs()
    except Exception as exc:
        log(f"error: unable to read installed tabs: {exc}")
        return 1

    tab_names: List[str] = [tab.get("name") for tab in installed_tabs if tab.get("name")]
    if not tab_names:
        log("no premium tabs registered – nothing to restore")
        return 0

    tab_paths = load_tab_manifests(premium_dir)
    failures = 0

    for tab_name in tab_names:
        tab_path = tab_paths.get(tab_name)
        if not tab_path:
            log(f"warning: installed tab '{tab_name}' not found in premium directory")
            failures += 1
            continue

        log(f"restoring premium tab '{tab_name}' from {tab_path}")
        success = installer.install_premium_tab(
            str(tab_path),
            batch_mode=True,  # skip redundant rebuild/restart
            skip_name_collision_check=True,
        )

        if success:
            log(f"✓ restored '{tab_name}'")
        else:
            log(f"✗ failed to restore '{tab_name}'")
            failures += 1

    if failures:
        log(f"completed with {failures} failure(s)")
        return 1

    log("premium tab restoration complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())

