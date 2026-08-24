from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "market-data.json"
STATE = ROOT / "data" / "investment-selection-state.json"
MAX_HISTORY = 250


def load(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    root = load(DATA, {})
    state = load(STATE, {})
    inv = root.get("investment") or {}
    candidates = inv.get("candidates") or []

    history = state.setdefault("confirmedPurchaseHistory", [])
    active = state.setdefault("activeConfirmedPurchases", {})
    now = datetime.now(timezone.utc).isoformat()

    for item in candidates:
        ticker = item.get("ticker")
        if not ticker:
            continue
        confirmation = item.get("confirmation") or {}
        is_confirmed = bool(confirmation.get("confirmed"))

        if is_confirmed and ticker not in active:
            event = {
                "id": f"{ticker}:{now}",
                "ticker": ticker,
                "name": item.get("name") or ticker,
                "signalDate": now,
                "signalPrice": item.get("currentPrice"),
                "finalScore": item.get("finalScore"),
                "qualityScore": item.get("qualityScore"),
                "trendScore": item.get("trendScore"),
                "entryScore": item.get("entryScore"),
                "pullbackPct": item.get("pullbackPct"),
                "entryZoneLow": item.get("entryZoneLow"),
                "entryZoneHigh": item.get("entryZoneHigh"),
                "invalidation": item.get("invalidation"),
                "target1": item.get("target1"),
                "target2": item.get("target2"),
                "target3": item.get("target3"),
                "statusAtSignal": "GREEN",
                "summaryAtSignal": item.get("executiveSummary"),
            }
            history.append(event)
            active[ticker] = event["id"]
        elif not is_confirmed:
            active.pop(ticker, None)

    # Se un titolo esce dalla selezione, un eventuale nuovo verde futuro deve
    # poter generare un nuovo evento distinto, senza cancellare il vecchio.
    current_tickers = {c.get("ticker") for c in candidates if c.get("ticker")}
    for ticker in list(active):
        if ticker not in current_tickers:
            active.pop(ticker, None)

    history = history[-MAX_HISTORY:]
    state["confirmedPurchaseHistory"] = history
    inv["confirmedPurchaseHistory"] = list(reversed(history))
    inv["confirmedPurchaseHistoryCount"] = len(history)
    root["investment"] = inv

    save(STATE, state)
    save(DATA, root)
    print(f"Storico acquisti confermati: {len(history)} eventi")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
