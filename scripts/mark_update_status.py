from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUS = ROOT / "data" / "update-status.json"


def load_status() -> dict:
    try:
        return json.loads(STATUS.read_text(encoding="utf-8"))
    except Exception:
        return {}


def main() -> int:
    if len(sys.argv) < 2:
        raise SystemExit("Uso: mark_update_status.py trading|investing|etf")

    module = sys.argv[1].strip().lower()
    if module not in {"trading", "investing", "etf"}:
        raise SystemExit(f"Modulo non valido: {module}")

    data = load_status()
    data[module] = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "ok": True,
    }
    STATUS.parent.mkdir(parents=True, exist_ok=True)
    STATUS.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Stato aggiornamento {module}: {data[module]['updatedAt']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
