from __future__ import annotations

import json
import sys
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "market-data.json"
STATE = ROOT / "data" / "investment-selection-state.json"
SNAPSHOT = Path("/tmp/market-compass-investment-fresh.json")


def load(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def score(item: dict) -> float:
    try:
        return float(item.get("stableScore", item.get("finalScore", 0)) or 0)
    except Exception:
        return 0.0


def trend_health(ticker: str) -> dict:
    """Replica il filtro anti-parabolico del generatore principale.

    Un titolo e' strutturalmente non idoneo se negli ultimi sei mesi ha avuto
    un balzo a 21 sedute >25%, e' >45% sopra EMA200, oppure rende >55% in 6 mesi.
    Non e' un normale segnale di uscita: e' un veto metodologico immediato.
    """
    try:
        h = yf.Ticker(ticker).history(period="18mo", interval="1d", auto_adjust=True)
        close = h["Close"].dropna()
        if len(close) < 200:
            return {"explosive": False, "known": False}
        price = float(close.iloc[-1])
        ema200 = float(close.ewm(span=200, adjust=False).mean().iloc[-1])
        rolling21 = close.pct_change(21).tail(126) * 100
        max21 = float(rolling21.max()) if not rolling21.empty else 0.0
        ext200 = (price / ema200 - 1) * 100 if ema200 else 0.0
        ret6 = (price / float(close.iloc[-126]) - 1) * 100 if len(close) >= 126 else 0.0
        explosive = bool(max21 > 25 or ext200 > 45 or ret6 > 55)
        return {
            "explosive": explosive,
            "known": True,
            "max21dSurgePct": max21,
            "extensionEma200Pct": ext200,
            "return6mPct": ret6,
        }
    except Exception as exc:
        print(f"Trend-health {ticker}: {type(exc).__name__}: {exc}")
        return {"explosive": False, "known": False}


def snapshot() -> int:
    root = load(DATA, {})
    fresh = list((root.get("investment") or {}).get("candidates") or [])
    save(SNAPSHOT, fresh)
    print(f"Snapshot Investing fresco: {len(fresh)} candidati")
    return 0


def enforce() -> int:
    root = load(DATA, {})
    inv = root.get("investment") or {}
    current = list(inv.get("candidates") or [])
    fresh = load(SNAPSHOT, [])
    if not current:
        return 0

    removed = []
    healthy = []
    for item in current:
        ticker = item.get("ticker")
        check = trend_health(ticker) if ticker else {"explosive": False, "known": False}
        item["trendHealthGuard"] = check
        if check.get("explosive"):
            item["explosiveTrend"] = True
            removed.append(item)
        else:
            healthy.append(item)

    if not removed:
        inv["trendHealthGuard"] = {"active": True, "removed": []}
        root["investment"] = inv
        save(DATA, root)
        return 0

    used = {x.get("ticker") for x in healthy}
    replacements = []
    for candidate in sorted(fresh, key=score, reverse=True):
        ticker = candidate.get("ticker")
        if not ticker or ticker in used:
            continue
        # Il generatore fresco applica gia' il filtro; verifichiamo comunque
        # anche qui per impedire che una regressione futura lo aggiri.
        check = trend_health(ticker)
        if check.get("known") and check.get("explosive"):
            continue
        candidate["trendHealthGuard"] = check
        healthy.append(candidate)
        replacements.append(ticker)
        used.add(ticker)
        if len(healthy) >= 5:
            break

    healthy = healthy[:5]
    healthy.sort(key=score, reverse=True)
    for rank, item in enumerate(healthy, 1):
        item["rank"] = rank

    removed_tickers = [x.get("ticker") for x in removed]
    inv["candidates"] = healthy
    inv["trendHealthGuard"] = {
        "active": True,
        "hardVeto": True,
        "removed": removed_tickers,
        "replacements": replacements,
        "reason": "Movimento recente esplosivo/parabolico: esclusione immediata, senza attendere i 5 giorni di rotazione.",
    }
    inv.setdefault("rules", {})["explosiveTrendHardExclusion"] = True
    root["investment"] = inv
    save(DATA, root)

    state = load(STATE, {})
    state["strictSelection"] = healthy
    state["candidates"] = healthy
    confirmations = state.get("confirmations") or {}
    for ticker in removed_tickers:
        confirmations.pop(ticker, None)
    state["confirmations"] = confirmations
    save(STATE, state)

    print(f"Filtro anti-esplosione: rimossi={removed_tickers}; sostituti={replacements}")
    return 0


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "enforce"
    if mode == "snapshot":
        return snapshot()
    if mode == "enforce":
        return enforce()
    raise SystemExit("Uso: investment_trend_health_guard.py [snapshot|enforce]")


if __name__ == "__main__":
    raise SystemExit(main())
