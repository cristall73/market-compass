from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "market-data.json"
STATE = ROOT / "data" / "investment-selection-state.json"


def load(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def business_days(a, b) -> int:
    """Numero di giorni di Borsa feriali trascorsi dopo a fino a b incluso."""
    d = a
    n = 0
    while d < b:
        d += timedelta(days=1)
        if d.weekday() < 5:
            n += 1
    return n


def main() -> int:
    root = load(DATA, {})
    state = load(STATE, {})
    inv = root.get("investment") or {}
    candidates = inv.get("candidates") or []
    if not candidates:
        return 0

    today = datetime.now(timezone.utc).date()
    today_s = today.isoformat()

    counters = state.setdefault("selectionTenure", {})
    previous_active = set(state.get("selectionCounterActive") or [])
    current_active = {str(c.get("ticker")) for c in candidates if c.get("ticker")}

    for c in candidates:
        ticker = str(c.get("ticker") or "")
        if not ticker:
            continue

        rec = counters.get(ticker)
        # Se il titolo entra (o rientra) oggi, parte da 1 giorno.
        if ticker not in previous_active or not isinstance(rec, dict):
            rec = {
                "firstDate": today_s,
                "lastDate": today_s,
                "days": 1,
            }
        else:
            last_s = rec.get("lastDate") or today_s
            try:
                last = datetime.fromisoformat(last_s).date()
            except Exception:
                last = today

            if last != today:
                elapsed = business_days(last, today)
                rec["days"] = max(1, int(rec.get("days", 1)) + elapsed)
                rec["lastDate"] = today_s

        counters[ticker] = rec

        memory = c.setdefault("memory", {})
        # Questo è il contatore che la UI mostra come "Top5 X gg".
        # Va calcolato sulla selezione effettivamente mantenuta dal Coach,
        # non sulla fotografia storica precedente al post-processing.
        memory["consecutiveTop5Days"] = int(rec.get("days", 1))
        memory["selectionDays"] = int(rec.get("days", 1))
        memory["selectionFirstDate"] = rec.get("firstDate")
        memory["selectionLastDate"] = rec.get("lastDate")

    # I titoli usciti non vengono cancellati dallo storico, ma se rientrano
    # verranno riconosciuti come nuovi perché non sono nell'insieme attivo.
    state["selectionCounterActive"] = sorted(current_active)
    state["selectionTenure"] = counters

    save(STATE, state)
    save(DATA, root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
