from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAL = ROOT / "data" / "economic-calendar.json"

BAD_TITLE = re.compile(
    r"error\s*500|server error|that's an error|that’s an error|please try again later|we know\.?$",
    re.IGNORECASE,
)


def valid_event(event: dict) -> bool:
    title = str(event.get("title") or "").strip()
    if not title or BAD_TITLE.search(title):
        return False
    raw_date = event.get("date")
    if not raw_date:
        return False
    try:
        datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
    except Exception:
        return False
    return True


def main() -> int:
    if not CAL.exists():
        return 0
    try:
        payload = json.loads(CAL.read_text(encoding="utf-8"))
    except Exception:
        return 0

    events = payload.get("events") or []
    clean = [event for event in events if isinstance(event, dict) and valid_event(event)]
    removed = len(events) - len(clean)
    payload["events"] = clean
    payload["sourceStatus"] = "ok" if clean else "temporarily_unavailable"
    payload["discardedInvalidEvents"] = removed
    CAL.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Calendario: {len(clean)} eventi validi, {removed} record scartati.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
