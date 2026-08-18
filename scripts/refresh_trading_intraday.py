from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "market-data.json"

# Asset del Trading Coach che devono avere dati intraday freschi.
SYMBOLS_24H = {"XAUUSD", "XAGUSD", "WTI", "EURUSD", "USDJPY"}


def normalize_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if frame is None or frame.empty:
        return pd.DataFrame()
    if isinstance(frame.columns, pd.MultiIndex):
        frame.columns = frame.columns.get_level_values(0)
    required = ["Open", "High", "Low", "Close"]
    if not all(column in frame.columns for column in required):
        return pd.DataFrame()
    result = frame[required].copy().dropna(subset=required)
    result.index = pd.to_datetime(result.index, utc=True)
    return result


def candles_to_frame(candles: list[dict]) -> pd.DataFrame:
    if not candles:
        return pd.DataFrame()
    rows = []
    for candle in candles:
        try:
            rows.append({
                "time": pd.to_datetime(candle["time"], utc=True),
                "Open": float(candle["open"]),
                "High": float(candle["high"]),
                "Low": float(candle["low"]),
                "Close": float(candle["close"]),
            })
        except Exception:
            continue
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows).set_index("time").sort_index()


def serialize(frame: pd.DataFrame, limit: int) -> list[dict]:
    frame = normalize_frame(frame).tail(limit)
    result = []
    for timestamp, row in frame.iterrows():
        result.append({
            "time": timestamp.isoformat(),
            "open": float(row["Open"]),
            "high": float(row["High"]),
            "low": float(row["Low"]),
            "close": float(row["Close"]),
        })
    return result


def merge_hourly(existing: list[dict], fresh: pd.DataFrame) -> pd.DataFrame:
    old = candles_to_frame(existing)
    frames = [frame for frame in (old, fresh) if frame is not None and not frame.empty]
    if not frames:
        return pd.DataFrame()
    merged = pd.concat(frames).sort_index()
    merged = merged[~merged.index.duplicated(keep="last")]
    return merged


def aggregate_4h(hourly: pd.DataFrame) -> pd.DataFrame:
    if hourly.empty:
        return hourly
    return (
        hourly.resample("4h", origin="start_day")
        .agg({"Open": "first", "High": "max", "Low": "min", "Close": "last"})
        .dropna()
    )


def download_fresh_hourly(ticker: str) -> pd.DataFrame:
    # Yahoo a volte lascia indietro la serie 1H quando si usa un periodo lungo,
    # soprattutto sui futures in fase di rollover. Proviamo finestre brevi e
    # teniamo quella con la candela più recente.
    best = pd.DataFrame()
    best_time = None
    for period in ("7d", "5d", "1mo"):
        try:
            frame = normalize_frame(
                yf.download(
                    ticker,
                    period=period,
                    interval="1h",
                    auto_adjust=False,
                    progress=False,
                    threads=False,
                    timeout=30,
                )
            )
        except Exception:
            continue
        if frame.empty:
            continue
        latest = frame.index[-1]
        if best_time is None or latest > best_time:
            best = frame
            best_time = latest
    return best


def freshest_price(asset: dict) -> tuple[float | None, str | None]:
    candidates = []
    for timeframe in ("1H", "4H", "1D", "1W", "1M"):
        candles = asset.get("timeframes", {}).get(timeframe) or []
        if not candles:
            continue
        candle = candles[-1]
        try:
            when = pd.to_datetime(candle["time"], utc=True)
            price = float(candle["close"])
        except Exception:
            continue
        candidates.append((when, price, timeframe))
    if not candidates:
        return None, None
    when, price, timeframe = max(candidates, key=lambda item: item[0])
    return price, timeframe


def main() -> None:
    payload = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)

    for asset in payload.get("assets", []):
        ticker = asset.get("providerSymbol")
        symbol = asset.get("symbol")
        if not ticker:
            continue

        timeframes = asset.setdefault("timeframes", {})
        fresh = download_fresh_hourly(ticker)
        merged = merge_hourly(timeframes.get("1H", []), fresh)

        if not merged.empty:
            timeframes["1H"] = serialize(merged, 720)
            timeframes["4H"] = serialize(aggregate_4h(merged), 260)

        latest_1h = None
        if timeframes.get("1H"):
            latest_1h = pd.to_datetime(timeframes["1H"][-1]["time"], utc=True)

        current_price, current_source = freshest_price(asset)
        if current_price is not None:
            asset["currentPrice"] = current_price

        age_hours = None
        if latest_1h is not None:
            age_hours = max(0.0, (pd.Timestamp(now) - latest_1h).total_seconds() / 3600)

        # Per mercati quasi continui, oltre 6 ore in un giorno feriale il dato
        # non è abbastanza fresco per un segnale esecutivo. Per indici cash
        # lasciamo una tolleranza maggiore perché fuori sessione è normale.
        weekday = now.weekday() < 5
        stale_limit = 6 if symbol in SYMBOLS_24H else 18
        stale = bool(weekday and age_hours is not None and age_hours > stale_limit)

        asset["freshness"] = {
            "checkedAt": now.isoformat(),
            "latest1H": latest_1h.isoformat() if latest_1h is not None else None,
            "ageHours": round(age_hours, 2) if age_hours is not None else None,
            "stale": stale,
            "currentPriceSource": current_source,
        }

        # Sicurezza: se l'intraday resta vecchio, impediamo al frontend di
        # presentare un ingresso operativo basato su 1H/4H non aggiornati.
        if stale:
            timeframes["1H"] = []
            timeframes["4H"] = []
            errors = asset.setdefault("errors", [])
            errors.append(
                f"Dati intraday non freschi: ultima 1H {latest_1h.isoformat() if latest_1h is not None else 'assente'}"
            )

    payload["freshnessCheckedAt"] = now.isoformat()
    DATA_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
