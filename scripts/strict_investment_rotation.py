from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "market-data.json"
STATE = ROOT / "data" / "investment-selection-state.json"
CAL = ROOT / "data" / "economic-calendar.json"

ENTRY_CONFIRM_DAYS = 5
EXIT_CONFIRM_DAYS = 5
ENTRY_MARGIN = 0.40
MAX_ROTATIONS_PER_DAY = 1
MIN_CHALLENGER_SCORE = 7.15
EXIT_ARCHIVE_DAYS = 14


def load(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def score(item) -> float:
    try:
        return float(item.get("stableScore", item.get("finalScore", 0)) or 0)
    except Exception:
        return 0.0


def is_red(item) -> bool:
    return str(item.get("rawStatus") or item.get("status") or "RED").upper() == "RED"


def refresh_price(item: dict) -> None:
    ticker = item.get("ticker")
    if not ticker:
        return
    try:
        hist = yf.Ticker(ticker).history(period="5d", interval="1d", auto_adjust=True)
        if not hist.empty:
            item["currentPrice"] = float(hist["Close"].dropna().iloc[-1])
    except Exception:
        pass


def prune_and_refresh_exit_archive(rows: list[dict], today_text: str) -> list[dict]:
    try:
        today = datetime.fromisoformat(today_text).date()
    except Exception:
        today = datetime.now(timezone.utc).date()
    cutoff = today - timedelta(days=EXIT_ARCHIVE_DAYS)
    kept = []
    for row in rows:
        try:
            exit_date = datetime.fromisoformat(str(row.get("exitDate"))).date()
        except Exception:
            continue
        if exit_date < cutoff:
            continue
        refreshed = dict(row)
        refresh_price(refreshed)
        exit_price = refreshed.get("exitPrice")
        current_price = refreshed.get("currentPrice")
        try:
            refreshed["returnSinceExitPct"] = (float(current_price) / float(exit_price) - 1) * 100
        except Exception:
            refreshed["returnSinceExitPct"] = None
        kept.append(refreshed)
    kept.sort(key=lambda x: str(x.get("exitDate") or ""), reverse=True)
    return kept[:30]


def main() -> int:
    root = load(DATA, {})
    state = load(STATE, {})
    inv = root.get("investment") or {}
    proposed = inv.get("candidates") or []
    if not proposed:
        return 0

    today = datetime.now(timezone.utc).date().isoformat()

    strict = state.get("strictSelection") or state.get("candidates") or proposed
    strict = list(strict)[:5]

    strict_map = {x.get("ticker"): x for x in strict if x.get("ticker")}
    proposed_map = {x.get("ticker"): x for x in proposed if x.get("ticker")}
    strict_tickers = list(strict_map)

    rotation = state.setdefault("strictRotation", {})
    challenger_days = rotation.setdefault("challengerDays", {})
    incumbent_weak_days = rotation.setdefault("incumbentWeakDays", {})
    last_count_date = rotation.get("lastCountDate")

    if last_count_date != today:
        for ticker in strict_tickers:
            incumbent = proposed_map.get(ticker)
            weak = incumbent is None or is_red(incumbent) or score(incumbent) < 6.55
            incumbent_weak_days[ticker] = int(incumbent_weak_days.get(ticker, 0)) + 1 if weak else 0

        for ticker, candidate in proposed_map.items():
            if ticker in strict_map:
                challenger_days.pop(ticker, None)
                continue
            eligible = (not is_red(candidate)) and score(candidate) >= MIN_CHALLENGER_SCORE
            challenger_days[ticker] = int(challenger_days.get(ticker, 0)) + 1 if eligible else 0

        for ticker in list(challenger_days):
            if ticker not in proposed_map or ticker in strict_map:
                challenger_days.pop(ticker, None)

        rotation["lastCountDate"] = today

    updated_strict = []
    for old in strict:
        ticker = old.get("ticker")
        if ticker in proposed_map:
            updated_strict.append(proposed_map[ticker])
        else:
            kept = dict(old)
            refresh_price(kept)
            updated_strict.append(kept)
    strict = updated_strict
    strict_map = {x.get("ticker"): x for x in strict if x.get("ticker")}

    eligible_out = [
        x for x in strict
        if int(incumbent_weak_days.get(x.get("ticker"), 0)) >= EXIT_CONFIRM_DAYS
    ]
    eligible_in = [
        x for t, x in proposed_map.items()
        if t not in strict_map
        and int(challenger_days.get(t, 0)) >= ENTRY_CONFIRM_DAYS
        and not is_red(x)
        and score(x) >= MIN_CHALLENGER_SCORE
    ]

    eligible_out.sort(key=score)
    eligible_in.sort(key=score, reverse=True)

    exit_archive = prune_and_refresh_exit_archive(state.get("recentExitedCandidates") or [], today)
    entered, exited, reasons = [], [], []
    rotations = 0
    while eligible_out and eligible_in and rotations < MAX_ROTATIONS_PER_DAY:
        incumbent = eligible_out.pop(0)
        challenger = eligible_in.pop(0)
        gap = score(challenger) - score(incumbent)
        if gap < ENTRY_MARGIN:
            break

        out_ticker = incumbent.get("ticker")
        in_ticker = challenger.get("ticker")
        strict = [challenger if x.get("ticker") == out_ticker else x for x in strict]
        entered.append(in_ticker)
        exited.append(out_ticker)
        reason = (
            f"Uscita confermata dopo {EXIT_CONFIRM_DAYS} giorni consecutivi di deterioramento; "
            f"{in_ticker} confermato per {ENTRY_CONFIRM_DAYS} giorni e superiore di {gap:.2f} punti"
        )
        reasons.append({"ticker": out_ticker, "reason": reason})

        archived = {
            "ticker": out_ticker,
            "name": incumbent.get("name") or out_ticker,
            "sector": incumbent.get("sector"),
            "currency": incumbent.get("currency"),
            "exitDate": today,
            "exitPrice": incumbent.get("currentPrice"),
            "currentPrice": incumbent.get("currentPrice"),
            "exitScore": score(incumbent),
            "statusAtExit": incumbent.get("status"),
            "rawStatusAtExit": incumbent.get("rawStatus"),
            "replacementTicker": in_ticker,
            "reason": reason,
            "entryZoneLow": incumbent.get("entryZoneLow"),
            "entryZoneHigh": incumbent.get("entryZoneHigh"),
            "invalidation": incumbent.get("invalidation"),
            "returnSinceExitPct": 0.0,
        }
        exit_archive = [x for x in exit_archive if x.get("ticker") != out_ticker]
        exit_archive.insert(0, archived)

        challenger_days.pop(in_ticker, None)
        incumbent_weak_days.pop(out_ticker, None)
        rotations += 1

    exit_archive = prune_and_refresh_exit_archive(exit_archive, today)

    strict.sort(key=score, reverse=True)
    for rank, item in enumerate(strict, 1):
        item["rank"] = rank
        item["isNewEntry"] = item.get("ticker") in entered

    inv["candidates"] = strict[:5]
    inv["recentExitedCandidates"] = exit_archive
    inv["recentExitedRetentionDays"] = EXIT_ARCHIVE_DAYS
    inv["changes"] = {
        "date": today,
        "entered": entered,
        "exited": exited,
        "removedReasons": reasons,
        "unchangedCount": len(strict[:5]) - len(entered),
        "strictRotation": True,
    }
    inv.setdefault("rules", {}).update({
        "selectionEntryConfirmationDays": ENTRY_CONFIRM_DAYS,
        "selectionExitConfirmationDays": EXIT_CONFIRM_DAYS,
        "selectionEntryMargin": ENTRY_MARGIN,
        "maxRotationsPerDay": MAX_ROTATIONS_PER_DAY,
        "strictSelection": True,
        "recentExitedRetentionDays": EXIT_ARCHIVE_DAYS,
    })

    state["strictSelection"] = strict[:5]
    state["candidates"] = strict[:5]
    state["strictRotation"] = rotation
    state["recentExitedCandidates"] = exit_archive
    root["investment"] = inv

    cal = load(CAL, {})
    if cal:
        cal["investmentCandidates"] = [
            {"name": c.get("name"), "ticker": c.get("ticker"), "sector": c.get("sector")}
            for c in strict[:5]
        ]
        save(CAL, cal)

    save(STATE, state)
    save(DATA, root)
    print(
        f"Top5 Investing rigida: {', '.join(c.get('ticker','?') for c in strict[:5])}; "
        f"entrate={entered or 'nessuna'} uscite={exited or 'nessuna'}; "
        f"archivio uscite recenti={len(exit_archive)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
