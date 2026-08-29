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
    # Un solo download giornaliero; Weekly e Monthly sono ricavati dalla stessa
    # serie, così i tre timeframe sono coerenti tra loro e non moltiplichiamo
    # inutilmente le richieste a Yahoo.
    hist = yf.Ticker(ticker).history(period="10y", interval="1d", auto_adjust=True)
    if hist.empty or "Close" not in hist:
        raise ValueError("nessun dato prezzo")

    daily_close = hist["Close"].dropna()
    weekly_close = daily_close.resample("W-FRI").last().dropna()
    monthly_close = daily_close.resample("ME").last().dropna()

    d = tf_snapshot(daily_close)
    w = tf_snapshot(weekly_close)
    m = tf_snapshot(monthly_close)

    # Regole trend-following per l'Investment Coach (orizzonte 2-4 mesi).
    # MONTHLY: trend primario strutturalmente rialzista.
    monthly_ok = m["close"] > m["ema10"] > m["ema50"] > m["ema200"]
    # WEEKLY: la correzione deve aver lasciato spazio a una vera ripartenza,
    # non basta essere sopra la media lunga.
    weekly_ok = w["close"] > w["ema5"] > w["ema10"] > w["ema50"]
    # DAILY: trigger operativo. Prezzo sopra EMA50 e medie veloci nuovamente
    # ordinate al rialzo. Evita di comprare mentre il ritracciamento è ancora in corso.
    daily_ok = d["close"] > d["ema5"] > d["ema10"] > d["ema50"]

    return {
        "monthly": {**m, "ok": monthly_ok, "label": "OK" if monthly_ok else "ATTENDERE"},
        "weekly": {**w, "ok": weekly_ok, "label": "OK" if weekly_ok else "ATTENDERE"},
        "daily": {**d, "ok": daily_ok, "label": "OK" if daily_ok else "ATTENDERE"},
        "allConfirmed": bool(monthly_ok and weekly_ok and daily_ok),
        "rule": "Mensile: Close>EMA10>EMA50>EMA200; Settimanale: Close>EMA5>EMA10>EMA50; Giornaliero: Close>EMA5>EMA10>EMA50",
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
            technical_ok = mtf["allConfirmed"]
        except Exception as exc:
            # In assenza di dati NON diamo mai un falso verde.
            technical_ok = False
            c["multiTimeframeConfirmation"] = {
                "allConfirmed": False,
                "error": str(exc),
                "monthly": {"ok": False, "label": "DATI NON DISPONIBILI"},
                "weekly": {"ok": False, "label": "DATI NON DISPONIBILI"},
                "daily": {"ok": False, "label": "DATI NON DISPONIBILI"},
            }

        final_ok = bool(temporal_ok and technical_ok)
        confirmation["temporalConfirmed"] = temporal_ok
        confirmation["technicalConfirmed"] = technical_ok
        confirmation["confirmed"] = final_ok

        if final_ok:
            confirmation["label"] = "ACQUISTO CONFERMATO"
            c["status"] = "GREEN"
        elif temporal_ok:
            confirmation["label"] = "CANDIDATO CONFERMATO 5/5 — ATTESA CONFERMA MULTI-TIMEFRAME"
            # Il titolo resta candidato valido, ma NON è un segnale di acquisto.
            c["status"] = "YELLOW"
        else:
            confirmation["label"] = f"IN CONFERMA {confirmation.get('days', 0)}/{confirmation.get('requiredDays', 5)} GIORNI"
            if c.get("rawStatus") == "GREEN":
                c["status"] = "YELLOW"

    inv.setdefault("rules", {})["multiTimeframeEntryRequired"] = True
    inv["rules"]["multiTimeframeEntryLogic"] = "Acquisto confermato solo con 5/5 giorni + Monthly OK + Weekly OK + Daily trigger OK"
    inv["confirmedGreenCount"] = sum(1 for c in candidates if (c.get("confirmation") or {}).get("confirmed"))
    root["investment"] = inv
    DATA.write_text(json.dumps(root, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
