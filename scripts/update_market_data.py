from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "trading" / "data" / "market-data.json"

ASSETS = [
    {"name": "Nasdaq 100", "symbol": "USATEC", "yahoo": "^NDX"},
    {"name": "DAX 40", "symbol": "GER40", "yahoo": "^GDAXI"},
    {"name": "S&P 500", "symbol": "US500", "yahoo": "^GSPC"},
    {"name": "Gold", "symbol": "XAUUSD", "yahoo": "GC=F"},
    {"name": "Silver", "symbol": "XAGUSD", "yahoo": "SI=F"},
    {"name": "Petrolio WTI", "symbol": "WTI", "yahoo": "CL=F"},
    {"name": "EUR/USD", "symbol": "EURUSD", "yahoo": "EURUSD=X"},
    {"name": "USD/JPY", "symbol": "USDJPY", "yahoo": "JPY=X"},
]

DOWNLOADS = {
    "1M": {"period": "max", "interval": "1mo", "limit": 260},
    "1W": {"period": "10y", "interval": "1wk", "limit": 260},
    "1D": {"period": "3y", "interval": "1d", "limit": 260},
    "1H": {"period": "60d", "interval": "1h", "limit": 720},
}


def finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def normalize_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if frame is None or frame.empty:
        return pd.DataFrame()

    if isinstance(frame.columns, pd.MultiIndex):
        frame.columns = frame.columns.get_level_values(0)

    required = ["Open", "High", "Low", "Close"]
    if not all(column in frame.columns for column in required):
        return pd.DataFrame()

    result = frame[required].copy()
    result = result.dropna(subset=required)
    result.index = pd.to_datetime(result.index, utc=True)
    return result


def serialize(frame: pd.DataFrame, limit: int) -> list[dict[str, Any]]:
    frame = normalize_frame(frame).tail(limit)
    candles: list[dict[str, Any]] = []

    for timestamp, row in frame.iterrows():
        candle = {
            "time": timestamp.isoformat(),
            "open": finite(row["Open"]),
            "high": finite(row["High"]),
            "low": finite(row["Low"]),
            "close": finite(row["Close"]),
        }
        if all(candle[key] is not None for key in ("open", "high", "low", "close")):
            candles.append(candle)

    return candles


def aggregate_4h(hourly: pd.DataFrame) -> pd.DataFrame:
    hourly = normalize_frame(hourly)
    if hourly.empty:
        return hourly

    return (
        hourly.resample("4h", origin="start_day")
        .agg({"Open": "first", "High": "max", "Low": "min", "Close": "last"})
        .dropna()
    )


def download(ticker: str, period: str, interval: str) -> pd.DataFrame:
    return yf.download(
        ticker,
        period=period,
        interval=interval,
        auto_adjust=False,
        progress=False,
        threads=False,
        timeout=30,
    )


def fetch_asset(asset: dict[str, str]) -> dict[str, Any]:
    ticker = asset["yahoo"]
    timeframes: dict[str, list[dict[str, Any]]] = {}
    errors: list[str] = []
    hourly_frame = pd.DataFrame()

    for timeframe, options in DOWNLOADS.items():
        try:
            frame = download(ticker, options["period"], options["interval"])
            frame = normalize_frame(frame)
            if timeframe == "1H":
                hourly_frame = frame
            candles = serialize(frame, options["limit"])
            if len(candles) < 20:
                errors.append(f"{timeframe}: dati insufficienti ({len(candles)})")
            timeframes[timeframe] = candles
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{timeframe}: {type(exc).__name__}: {exc}")
            timeframes[timeframe] = []

    try:
        timeframes["4H"] = serialize(aggregate_4h(hourly_frame), 260)
        if len(timeframes["4H"]) < 20:
            errors.append(f"4H: dati insufficienti ({len(timeframes['4H'])})")
    except Exception as exc:  # noqa: BLE001
        errors.append(f"4H: {type(exc).__name__}: {exc}")
        timeframes["4H"] = []

    current_price = None
    for timeframe in ("1H", "1D", "1W", "1M"):
        candles = timeframes.get(timeframe, [])
        if candles:
            current_price = candles[-1]["close"]
            break

    return {
        "name": asset["name"],
        "symbol": asset["symbol"],
        "providerSymbol": ticker,
        "currentPrice": current_price,
        "timeframes": timeframes,
        "errors": errors,
    }


def main() -> int:
    payload = {
        "provider": "Yahoo Finance tramite yfinance",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "assets": [],
    }

    successful_assets = 0
    for asset in ASSETS:
        print(f"Scarico {asset['name']} ({asset['yahoo']})...", flush=True)
        result = fetch_asset(asset)
        payload["assets"].append(result)
        if all(len(result["timeframes"].get(tf, [])) >= 20 for tf in ("1M", "1W", "1D", "4H", "1H")):
            successful_assets += 1

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Scritto {OUTPUT}. Asset completi: {successful_assets}/{len(ASSETS)}")

    # Do not overwrite a previously valid file with a wholly failed fetch.
    return 0 if successful_assets > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
