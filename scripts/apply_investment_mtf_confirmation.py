from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "market-data.json"


def ema(series: pd.Series, span: int) -> float:
    return float(series.ewm(span=span, adjust=False).mean().iloc[-1])


def tf_snapshot(close: pd.Series) -> dict:
    close = close.dropna().astype(float)
    if len(close) < 20:
        raise ValueError("storico insufficiente")
    return {
        "close": float(close.iloc[-1]),
        "ema5": ema(close, 5),
        "ema10": ema(close, 10),
        "ema50": ema(close, 50),
        "ema200": ema(close, 200),
    }


def analyse_ticker(ticker: str) -> dict:
    hist = yf.Ticker(ticker).history(period="10y", interval="1d", auto_adjust=True)
    if hist.empty or "Close" not in hist:
        raise ValueError("nessun dato prezzo")

    daily_close = hist["Close"].dropna()
    weekly_close = daily_close.resample("W-FRI").last().dropna()
    monthly_close = daily_close.resample("ME").last().dropna()

    d = tf_snapshot(daily_close)
    w = tf_snapshot(weekly_close)
    m = tf_snapshot(monthly_close)

    monthly_ok = m["close"] > m["ema10"] > m["ema50"] > m["ema200"]
    weekly_ok = w["close"] > w["ema5"] > w["ema10"] > w["ema50"]
    daily_ok = d["close"] > d["ema5"] > d["ema10"] > d["ema50"]

    # Filtro anti-esplosione: un trend forte non basta, deve essere sano/progressivo.
    # Evita di comprare dopo accelerazioni paraboliche che possono ancora riassorbirsi molto.
    rolling_21 = daily_close.pct_change(21).tail(126) * 100
    max_21d_surge = float(rolling_21.max()) if not rolling_21.empty else 0.0
    ema200_d = ema(daily_close, 200)
    extension_ema200 = (float(daily_close.iloc[-1]) / ema200_d - 1) * 100 if ema200_d else 0.0
    return6m = (float(daily_close.iloc[-1]) / float(daily_close.iloc[-126]) - 1) * 100 if len(daily_close) >= 126 else 0.0
    explosive = bool(max_21d_surge > 25 or extension_ema200 > 45 or return6m > 55)

    trend_health = 10.0
    trend_health -= max(0.0, max_21d_surge - 15) * 0.18
    trend_health -= max(0.0, extension_ema200 - 25) * 0.10
    trend_health -= max(0.0, return6m - 35) * 0.08
    trend_health = max(0.0, min(10.0, trend_health))
    healthy_ok = bool(not explosive and trend_health >= 6.5)

    return {
        "monthly": {**m, "ok": monthly_ok, "label": "OK" if monthly_ok else "ATTENDERE"},
        "weekly": {**w, "ok": weekly_ok, "label": "OK" if weekly_ok else "ATTENDERE"},
        "daily": {**d, "ok": daily_ok, "label": "OK" if daily_ok else "ATTENDERE"},
        "trendHealth": {
            "ok": healthy_ok,
            "score": trend_health,
            "explosive": explosive,
            "max21dSurgePct": max_21d_surge,
            "extensionEma200Pct": extension_ema200,
            "return6mPct": return6m,
            "label": "SANO" if healthy_ok else "TROPPO ESPLOSIVO / ESTESO",
        },
        "allConfirmed": bool(monthly_ok and weekly_ok and daily_ok and healthy_ok),
        "rule": "Mensile + Settimanale + Daily rialzisti e trend sano; escluse accelerazioni paraboliche/esplosive",
    }


def main() -> int:
    root = json.loads(DATA.read_text(encoding="utf-8"))
    inv = root.get("investment") or {}
    candidates = inv.get("candidates") or []

    for c in candidates:
        ticker = c.get("ticker")
        if not ticker:
            continue

        confirmation = c.setdefault("confirmation", {})
        temporal_ok = int(confirmation.get("days", 0)) >= int(confirmation.get("requiredDays", 5))

        try:
            mtf = analyse_ticker(ticker)
            c["multiTimeframeConfirmation"] = mtf
            c["trendHealthScore"] = mtf["trendHealth"]["score"]
            c["explosiveTrend"] = mtf["trendHealth"]["explosive"]
            technical_ok = mtf["allConfirmed"]
        except Exception as exc:
            technical_ok = False
            c["multiTimeframeConfirmation"] = {
                "allConfirmed": False,
                "error": str(exc),
                "monthly": {"ok": False, "label": "DATI NON DISPONIBILI"},
                "weekly": {"ok": False, "label": "DATI NON DISPONIBILI"},
                "daily": {"ok": False, "label": "DATI NON DISPONIBILI"},
                "trendHealth": {"ok": False, "label": "DATI NON DISPONIBILI"},
            }

        final_ok = bool(temporal_ok and technical_ok)
        confirmation["temporalConfirmed"] = temporal_ok
        confirmation["technicalConfirmed"] = technical_ok
        confirmation["confirmed"] = final_ok

        if final_ok:
            confirmation["label"] = "ACQUISTO CONFERMATO"
            c["status"] = "GREEN"
        elif temporal_ok:
            health = (c.get("multiTimeframeConfirmation") or {}).get("trendHealth") or {}
            if health.get("explosive"):
                confirmation["label"] = "ATTENDERE — TREND TROPPO ESPLOSIVO"
            else:
                confirmation["label"] = "CANDIDATO CONFERMATO 5/5 — ATTESA CONFERMA MULTI-TIMEFRAME"
            c["status"] = "YELLOW"
        else:
            confirmation["label"] = f"IN CONFERMA {confirmation.get('days', 0)}/{confirmation.get('requiredDays', 5)} GIORNI"
            if c.get("rawStatus") == "GREEN":
                c["status"] = "YELLOW"

    inv.setdefault("rules", {})["multiTimeframeEntryRequired"] = True
    inv["rules"]["healthyTrendRequired"] = True
    inv["rules"]["healthyTrendLogic"] = "Trend-following sì, ma solo con salita progressiva: no accelerazioni paraboliche/esplosive o eccessiva estensione dalla EMA200"
    inv["rules"]["multiTimeframeEntryLogic"] = "Acquisto confermato solo con 5/5 giorni + Monthly OK + Weekly OK + Daily trigger OK + trend sano"
    inv["confirmedGreenCount"] = sum(1 for c in candidates if (c.get("confirmation") or {}).get("confirmed"))
    root["investment"] = inv
    DATA.write_text(json.dumps(root, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
