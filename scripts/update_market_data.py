from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from statistics import mean, pstdev
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "market-data.json"
HISTORY_OUTPUT = ROOT / "data" / "market-history.json"

# Trading Coach
TRADING_ASSETS = [
    {"name": "Nasdaq 100", "symbol": "USATEC", "yahoo": "^NDX"},
    {"name": "DAX 40", "symbol": "GER40", "yahoo": "^GDAXI"},
    {"name": "S&P 500", "symbol": "US500", "yahoo": "^GSPC"},
    {"name": "Gold", "symbol": "XAUUSD", "yahoo": "GC=F"},
    {"name": "Silver", "symbol": "XAGUSD", "yahoo": "SI=F"},
    {"name": "Petrolio WTI", "symbol": "WTI", "yahoo": "CL=F"},
    {"name": "EUR/USD", "symbol": "EURUSD", "yahoo": "EURUSD=X"},
    {"name": "USD/JPY", "symbol": "USDJPY", "yahoo": "JPY=X"},
]

TRADING_DOWNLOADS = {
    "1M": {"period": "max", "interval": "1mo", "limit": 260},
    "1W": {"period": "10y", "interval": "1wk", "limit": 260},
    "1D": {"period": "3y", "interval": "1d", "limit": 260},
    "1H": {"period": "60d", "interval": "1h", "limit": 720},
}

# Investment universe
INVESTMENT_TICKERS = [
    "AAPL","MSFT","NVDA","AMZN","GOOGL","META","AVGO","TSLA","BRK-B","LLY",
    "JPM","V","MA","WMT","XOM","ORCL","COST","NFLX","HD","PG","JNJ","ABBV",
    "BAC","KO","CRM","AMD","CSCO","PM","CVX","IBM","WFC","ABT","MCD","GE",
    "CAT","DIS","QCOM","INTU","GS","AXP","NOW","AMGN","ISRG","TXN","BKNG",
    "PFE","TMO","LOW","RTX","SPGI","BLK","NEE","COP","UNH","UBER","ADBE",
    "PANW","MU","AMAT","LRCX","KLAC","SNPS","CDNS","ANET","PLTR","DE","HON",
    "UPS","SBUX","MDT","SYK","GILD","VRTX","REGN","BSX","C","MS","SCHW","CB",
    "MMC","LIN","APD","ECL","NOC","LMT","GD","ETN","PH","WM","RSG","MAR","HLT",
    "ABNB","NKE","TGT","TJX","ROST","PGR","AON","ICE","ASML","SAP","NVO","TM",
    "SONY","TSM","AZN","SHEL","BABA","MELI","MC.PA","OR.PA","RMS.PA","SU.PA",
    "AIR.PA","SIE.DE","ALV.DE","DTE.DE","MBG.DE","BMW.DE","IFX.DE","RACE.MI",
    "ENEL.MI","ISP.MI","UCG.MI","NESN.SW","NOVN.SW","ROG.SW","ULVR.L","HSBA.L",
    "RIO.L","BP.L"
]

NEGATIVE_WORDS = {
    "miss","cuts","cut","warning","probe","lawsuit","ban","recall","weak",
    "decline","downgrade","slump","risk","tariff","delay","investigation",
    "fraud","sanction","lower","guidance cut","profit warning"
}
POSITIVE_WORDS = {
    "beat","raises","raise","record","upgrade","growth","approval","buyback",
    "launch","strong","surge","expands","contract","partnership","guidance raise"
}

SECTOR_RISKS = {
    "Technology": [
        "Tassi elevati possono comprimere i multipli.",
        "Restrizioni all'export e tensioni USA-Cina possono incidere sulla filiera."
    ],
    "Semiconductors": [
        "Settore ciclico e dipendente dalla domanda AI e data center.",
        "Taiwan e controlli all'export sono fattori geopolitici rilevanti."
    ],
    "Healthcare": [
        "Rischio regolatorio e pressione sui prezzi.",
        "Studi clinici, brevetti e approvazioni possono creare volatilità."
    ],
    "Financial Services": [
        "Sensibilità a tassi, curva dei rendimenti e qualità del credito.",
        "Rischi regolatori e di liquidità."
    ],
    "Consumer Cyclical": [
        "Sensibilità a consumi, inflazione e mercato del lavoro.",
        "Margini vulnerabili al rallentamento economico."
    ],
    "Energy": [
        "Sensibilità a petrolio, OPEC e geopolitica.",
        "Elevata volatilità delle materie prime."
    ],
    "Industrials": [
        "Sensibilità al ciclo economico e agli investimenti.",
        "Dazi e costi delle materie prime possono comprimere i margini."
    ]
}

# v10 – regole di stabilità
HISTORY_DAYS = 120
ENTRY_CONFIRMATION_DAYS = 3
EXIT_DEGRADATION_DAYS = 5
ENTRY_MARGIN = 0.40
TOP3_ENTRY_MARGIN = 0.65
LOYALTY_BONUS_MAX = 0.35
MIN_ENTRY_SCORE = 7.15
MIN_HOLD_SCORE = 6.55
STRUCTURAL_EXIT_SCORE = 5.60


def finite(value: Any, default: float | None = None) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


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


def serialize(frame: pd.DataFrame, limit: int) -> list[dict[str, Any]]:
    frame = normalize_frame(frame).tail(limit)
    candles = []
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


def yf_download(ticker: str, period: str, interval: str) -> pd.DataFrame:
    return yf.download(
        ticker, period=period, interval=interval, auto_adjust=False,
        progress=False, threads=False, timeout=30
    )


def fetch_trading_asset(asset: dict[str, str]) -> dict[str, Any]:
    ticker = asset["yahoo"]
    timeframes, errors = {}, []
    hourly_frame = pd.DataFrame()

    for timeframe, options in TRADING_DOWNLOADS.items():
        try:
            frame = normalize_frame(yf_download(ticker, options["period"], options["interval"]))
            if timeframe == "1H":
                hourly_frame = frame
            timeframes[timeframe] = serialize(frame, options["limit"])
        except Exception as exc:
            errors.append(f"{timeframe}: {type(exc).__name__}: {exc}")
            timeframes[timeframe] = []

    try:
        timeframes["4H"] = serialize(aggregate_4h(hourly_frame), 260)
    except Exception as exc:
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


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


def score_range(value: Any, bad: float, good: float, default: float = 5) -> float:
    number = finite(value)
    if number is None or bad == good:
        return default
    return max(0, min(10, (number - bad) / (good - bad) * 10))


def trend_label(price: float, fast: float, slow: float) -> str:
    if price > fast > slow:
        return "Rialzista"
    if price > slow:
        return "Rialzista debole"
    if price < fast < slow:
        return "Ribassista"
    return "Neutrale"


def trend_number(label: str) -> float:
    return {"Rialzista": 9, "Rialzista debole": 6, "Neutrale": 4, "Ribassista": 2}.get(label, 4)


def load_history() -> dict[str, Any]:
    if not HISTORY_OUTPUT.exists():
        return {"schemaVersion": 10, "snapshots": [], "validations": []}
    try:
        history = json.loads(HISTORY_OUTPUT.read_text(encoding="utf-8"))
        history.setdefault("snapshots", [])
        history.setdefault("validations", [])
        return history
    except Exception:
        return {"schemaVersion": 10, "snapshots": [], "validations": []}


def unique_daily_snapshots(snapshots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_date = {}
    for snapshot in snapshots:
        snapshot_date = snapshot.get("date")
        if snapshot_date:
            by_date[snapshot_date] = snapshot
    return [by_date[key] for key in sorted(by_date)][-HISTORY_DAYS:]


def ticker_daily_records(history: dict[str, Any], ticker: str) -> list[dict[str, Any]]:
    records = []
    for snapshot in unique_daily_snapshots(history.get("snapshots", [])):
        item = next((x for x in snapshot.get("universe", []) if x.get("ticker") == ticker), None)
        if item:
            records.append({
                "date": snapshot["date"],
                "rank": item.get("rank"),
                "rawScore": item.get("rawScore"),
                "stableScore": item.get("stableScore"),
                "status": item.get("status"),
                "inTop5": bool(item.get("inTop5")),
                "price": item.get("price"),
            })
    return records


def consecutive(records: list[dict[str, Any]], predicate) -> int:
    count = 0
    for record in reversed(records):
        if predicate(record):
            count += 1
        else:
            break
    return count


def days_between(first: str | None, last: str | None) -> int:
    if not first or not last:
        return 0
    try:
        return (date.fromisoformat(last) - date.fromisoformat(first)).days + 1
    except Exception:
        return 0


def quick_investment_screen() -> list[dict[str, Any]]:
    downloaded = yf.download(
        INVESTMENT_TICKERS, period="3y", interval="1d", auto_adjust=True,
        progress=False, group_by="ticker", threads=True, timeout=90
    )
    screened = []

    for ticker in INVESTMENT_TICKERS:
        try:
            frame = downloaded[ticker] if isinstance(downloaded.columns, pd.MultiIndex) else downloaded
            if frame is None or frame.empty or "Close" not in frame:
                continue
            close, high, low = frame["Close"].dropna(), frame["High"].dropna(), frame["Low"].dropna()
            if len(close) < 260:
                continue

            price = float(close.iloc[-1])
            high52 = float(close.tail(252).max())
            pullback = (high52 - price) / high52 * 100
            ema50 = float(close.ewm(span=50).mean().iloc[-1])
            ema200 = float(close.ewm(span=200).mean().iloc[-1])
            rsi_daily = finite(rsi(close).iloc[-1], 50) or 50
            return3m = (price / float(close.iloc[-63]) - 1) * 100
            volatility = float(close.pct_change().tail(63).std() * math.sqrt(252) * 100)

            weekly = close.resample("W").last()
            monthly = close.resample("ME").last()
            weekly_trend = trend_label(
                float(weekly.iloc[-1]),
                float(weekly.ewm(span=20).mean().iloc[-1]),
                float(weekly.ewm(span=50).mean().iloc[-1]),
            )
            monthly_trend = trend_label(
                float(monthly.iloc[-1]),
                float(monthly.ewm(span=10).mean().iloc[-1]),
                float(monthly.ewm(span=20).mean().iloc[-1]),
            )
            daily_trend = trend_label(price, ema50, ema200)

            required_min = max(8, min(15, volatility * 0.32))
            required_max = max(required_min + 3, min(22, volatility * 0.50))
            trend_score = float(np.mean([
                trend_number(monthly_trend), trend_number(weekly_trend),
                trend_number(daily_trend), score_range(return3m, -15, 25)
            ]))

            midpoint = (required_min + required_max) / 2
            half_range = max(1, (required_max - required_min) / 2)
            entry_score = max(0, min(10, 10 - abs(pullback - midpoint) / half_range * 4))
            if price < ema200:
                entry_score = max(0, entry_score - 2)
            if rsi_daily > 70:
                entry_score = max(0, entry_score - 2)

            preliminary = trend_score * 0.58 + entry_score * 0.42
            if monthly_trend == "Ribassista" or weekly_trend == "Ribassista":
                preliminary -= 2

            atr = pd.concat([
                high - low, (high - close.shift()).abs(), (low - close.shift()).abs()
            ], axis=1).max(axis=1).rolling(14).mean().iloc[-1]

            screened.append({
                "ticker": ticker, "price": price, "high52": high52,
                "pullbackPct": pullback, "requiredPullbackMin": required_min,
                "requiredPullbackMax": required_max, "trendScore": trend_score,
                "entryScore": entry_score, "preliminaryScore": max(0, min(10, preliminary)),
                "rsiDaily": rsi_daily, "return3m": return3m, "volatility": volatility,
                "ema200": ema200, "monthlyTrend": monthly_trend,
                "weeklyTrend": weekly_trend, "dailyTrend": daily_trend,
                "support": float(low.tail(90).quantile(0.12)),
                "resistance": float(high.tail(90).quantile(0.90)),
                "atr": float(atr),
            })
        except Exception as exc:
            print(f"Screening {ticker}: {type(exc).__name__}: {exc}", flush=True)

    screened.sort(key=lambda x: x["preliminaryScore"], reverse=True)
    return screened


def as_percent(value: Any) -> float | None:
    number = finite(value)
    if number is None:
        return None
    return number * 100 if abs(number) <= 3 else number


def get_news(ticker_object: yf.Ticker) -> list[dict[str, Any]]:
    result = []
    try:
        for item in (ticker_object.news or [])[:6]:
            content = item.get("content", item)
            title = content.get("title") or item.get("title")
            provider = content.get("provider")
            publisher = provider.get("displayName") if isinstance(provider, dict) else item.get("publisher")
            if title:
                result.append({"title": title, "publisher": publisher})
    except Exception:
        pass
    return result


def news_sentiment(news: list[dict[str, Any]]) -> int:
    score = 0
    for item in news:
        text = str(item.get("title") or "").lower()
        score += sum(1 for word in POSITIVE_WORDS if word in text)
        score -= sum(1 for word in NEGATIVE_WORDS if word in text)
    return max(-5, min(5, score))


def sector_name(info: dict[str, Any]) -> str:
    sector = info.get("sector") or "Altro"
    if "Semiconductor" in (info.get("industry") or ""):
        return "Semiconductors"
    return sector


def enrich_candidate(base: dict[str, Any], history: dict[str, Any]) -> dict[str, Any]:
    ticker = base["ticker"]
    ticker_object = yf.Ticker(ticker)
    try:
        info = ticker_object.info or {}
    except Exception:
        info = {}

    name = info.get("longName") or info.get("shortName") or ticker
    sector = sector_name(info)
    currency = info.get("currency") or ""

    revenue_growth = as_percent(info.get("revenueGrowth"))
    earnings_growth = as_percent(info.get("earningsGrowth"))
    operating_margin = as_percent(info.get("operatingMargins"))
    roe = as_percent(info.get("returnOnEquity"))
    debt_to_equity = finite(info.get("debtToEquity"))
    forward_pe = finite(info.get("forwardPE"))
    free_cash_flow = finite(info.get("freeCashflow"))

    quality_score = float(np.mean([
        score_range(revenue_growth, -5, 20),
        score_range(earnings_growth, -10, 25),
        score_range(operating_margin, 5, 35),
        score_range(roe, 5, 30),
        10 - score_range(debt_to_equity, 30, 250) if debt_to_equity is not None else 5,
        10 - score_range(forward_pe, 12, 45) if forward_pe else 5,
        8 if free_cash_flow and free_cash_flow > 0 else 2,
    ]))

    news = get_news(ticker_object)
    sentiment = news_sentiment(news)
    news_score = 5 + sentiment
    raw_score = max(0, min(10,
        quality_score * 0.34 + base["trendScore"] * 0.28 +
        base["entryScore"] * 0.25 + news_score * 0.13
    ))

    records = ticker_daily_records(history, ticker)
    historical_scores = [finite(x.get("rawScore")) for x in records[-30:]]
    historical_scores = [x for x in historical_scores if x is not None]
    historical_average = mean(historical_scores) if historical_scores else raw_score

    top5_days = sum(1 for x in records if x.get("inTop5"))
    consecutive_top5 = consecutive(records, lambda x: x.get("inTop5"))
    loyalty_bonus = min(LOYALTY_BONUS_MAX, consecutive_top5 * 0.035)

    # 70% storico, 30% odierno: rende la classifica lenta.
    stable_score = historical_average * 0.70 + raw_score * 0.30 + loyalty_bonus
    stable_score = max(0, min(10, stable_score))

    score_std = pstdev(historical_scores[-20:]) if len(historical_scores) >= 2 else 0
    stability_score = max(0, min(10,
        4.5 + min(3.0, consecutive_top5 * 0.30) + min(1.5, top5_days * 0.05) - min(3, score_std * 2)
    ))

    first_seen = records[0]["date"] if records else None
    last_seen = records[-1]["date"] if records else None
    consecutive_seen = consecutive(records, lambda x: True)
    score_7d_ago = historical_scores[-7] if len(historical_scores) >= 7 else (historical_scores[0] if historical_scores else raw_score)
    momentum = raw_score - score_7d_ago
    momentum_label = "Migliora" if momentum > 0.20 else "Peggiora" if momentum < -0.20 else "Stabile"

    green_days = sum(1 for x in records if x.get("status") == "GREEN")
    reliability = max(25, min(95,
        45 + stability_score * 3 + min(15, consecutive_top5 * 1.5) + min(8, green_days * 0.5)
    ))
    confidence = max(25, min(95,
        stable_score * 6 + stability_score * 2.5 + min(12, consecutive_top5)
    ))

    status = "RED"
    if (
        quality_score >= 6.5 and base["trendScore"] >= 6 and
        base["requiredPullbackMin"] <= base["pullbackPct"] <= base["requiredPullbackMax"] and
        40 <= base["rsiDaily"] <= 62 and base["price"] > base["ema200"] and sentiment >= -1
    ):
        status = "GREEN"
    elif (
        quality_score >= 6 and base["trendScore"] >= 5.5 and
        base["pullbackPct"] >= base["requiredPullbackMin"] * 0.55 and
        base["price"] > base["ema200"] and sentiment >= -2
    ):
        status = "YELLOW"

    high52 = base["high52"]
    entry_low = high52 * (1 - base["requiredPullbackMax"] / 100)
    entry_high = high52 * (1 - base["requiredPullbackMin"] / 100)
    entry_mid = (entry_low + entry_high) / 2
    watch_low = high52 * (1 - base["requiredPullbackMin"] * 0.85 / 100)
    watch_high = high52 * (1 - base["requiredPullbackMin"] * 0.45 / 100)
    invalidation = min(entry_low - base["atr"] * 1.2, base["ema200"] - base["atr"] * 0.5)
    risk = max(0.01, entry_mid - invalidation)

    risks = list(SECTOR_RISKS.get(sector, ["Rallentamento macroeconomico e compressione dei multipli."]))
    if sentiment < 0:
        risks.append("Le notizie recenti contengono elementi negativi da verificare.")
    if forward_pe and forward_pe > 35:
        risks.append("Valutazione elevata rispetto a livelli prudenti.")
    if debt_to_equity and debt_to_equity > 150:
        risks.append("Leva finanziaria elevata.")

    catalysts = []
    if revenue_growth and revenue_growth > 10:
        catalysts.append(f"Crescita ricavi sostenuta ({revenue_growth:.1f}%).")
    if earnings_growth and earnings_growth > 10:
        catalysts.append(f"Crescita degli utili positiva ({earnings_growth:.1f}%).")
    if sentiment > 0:
        catalysts.append("Flusso di notizie recente moderatamente favorevole.")
    catalysts.append("Possibile recupero verso i massimi se il supporto Daily regge.")

    diagnosis = "Il ritracciamento appare prevalentemente tecnico e compatibile con una presa di profitto."
    if sentiment <= -2:
        diagnosis = "Il ribasso coincide con notizie negative e non va considerato automaticamente uno sconto."
    elif base["price"] < base["ema200"]:
        diagnosis = "Il ribasso ha compromesso la struttura Daily di lungo periodo."

    conditions = []
    if base["pullbackPct"] < base["requiredPullbackMin"]:
        conditions.append(f"Ritracciamento almeno al {base['requiredPullbackMin']:.1f}%.")
    if base["rsiDaily"] > 62:
        conditions.append("RSI Daily sotto 62 o stabilizzazione.")
    if base["dailyTrend"] == "Ribassista":
        conditions.append("Recupero della struttura Daily.")
    if sentiment < -1:
        conditions.append("Assenza di nuove notizie strutturalmente negative.")
    if quality_score < 6.5:
        conditions.append("Conferma dei fondamentali.")
    if not conditions:
        conditions.append("Conferma Daily nella zona prima dell'esecuzione.")

    previous_rank = records[-1].get("rank") if records else None
    previous_top5 = bool(records[-1].get("inTop5")) if records else False

    return {
        "ticker": ticker, "name": name, "sector": sector, "currency": currency,
        "currentPrice": base["price"], "high52": high52,
        "pullbackPct": base["pullbackPct"],
        "requiredPullbackMin": base["requiredPullbackMin"],
        "requiredPullbackMax": base["requiredPullbackMax"],
        "qualityScore": quality_score, "trendScore": base["trendScore"],
        "entryScore": base["entryScore"], "newsScore": news_score,
        "rawScore": raw_score, "finalScore": stable_score, "stableScore": stable_score,
        "status": status, "watchZoneLow": watch_low, "watchZoneHigh": watch_high,
        "entryZoneLow": entry_low, "entryZoneHigh": entry_high,
        "invalidation": invalidation,
        "target1": entry_mid + risk * 1.2, "target2": entry_mid + risk * 2,
        "target3": entry_mid + risk * 3, "riskReward": "1 : 2.0",
        "executiveSummary": (
            f"{name} mantiene qualità {quality_score:.1f}/10 e trend {base['trendScore']:.1f}/10. "
            f"Quota a -{base['pullbackPct']:.1f}% dal massimo. "
            f"Punteggio odierno {raw_score:.1f}, media storica {historical_average:.1f}."
        ),
        "selectionReason": (
            "La selezione combina qualità fondamentale, trend di medio periodo, ritracciamento, "
            "notizie e persistenza storica. Piccole variazioni giornaliere non bastano a cambiare la Top 5."
        ),
        "pullbackDiagnosis": diagnosis, "catalysts": catalysts, "risks": risks,
        "news": news[:5], "conditionsForGreen": conditions,
        "memory": {
            "firstSeen": first_seen, "lastSeen": last_seen,
            "daysObserved": days_between(first_seen, last_seen),
            "consecutiveTop5Days": consecutive_top5, "totalTop5Days": top5_days,
            "stabilityScore": stability_score, "reliabilityPct": reliability,
            "confidencePct": confidence, "momentum": momentum,
            "momentumLabel": momentum_label, "score7DaysAgo": score_7d_ago,
            "historicalAverage": historical_average,
            "previousRank": previous_rank, "previousTop5": previous_top5,
            "greenDays": green_days,
            "badge": (
                "Veterano" if consecutive_top5 >= 15 else
                "Confermato" if consecutive_top5 >= 5 else
                "Nuovo candidato"
            )
        },
        "fundamentals": {
            "revenueGrowthPct": revenue_growth, "earningsGrowthPct": earnings_growth,
            "operatingMarginPct": operating_margin, "roePct": roe,
            "debtToEquity": debt_to_equity, "forwardPE": forward_pe,
            "freeCashFlowLabel": f"{free_cash_flow / 1e9:.2f} mld" if free_cash_flow else None,
        },
        "technical": {
            "monthly": base["monthlyTrend"], "weekly": base["weeklyTrend"],
            "daily": base["dailyTrend"], "rsiDaily": base["rsiDaily"],
            "relativeStrength3mPct": base["return3m"],
            "support": base["support"], "resistance": base["resistance"],
        },
        "earningsCommentary": (
            "Il sistema considera dati disponibili, ma trimestrali, guidance e conference call "
            "devono essere verificate sulle fonti ufficiali."
        ),
        "nextEarningsDate": None,
        "earningsSurprisePct": finite(info.get("earningsQuarterlyGrowth")),
        "estimateRevision": "Non disponibile in modo uniforme dalla fonte gratuita.",
        "scenarios": {
            "A": f"Attendere un ritorno fra {entry_low:.2f} e {entry_high:.2f} con stabilizzazione Daily.",
            "B": "Se rompe i massimi senza ritracciare, non inseguire.",
            "C": f"Escludere con chiusura Daily/Weekly sotto {invalidation:.2f} o deterioramento fondamentale."
        }
    }


def rank_with_hysteresis(enriched: list[dict[str, Any]], history: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    today = date.today().isoformat()
    previous_snapshot = unique_daily_snapshots(history.get("snapshots", []))
    previous_snapshot = previous_snapshot[-1] if previous_snapshot else None
    previous_top = [x["ticker"] for x in previous_snapshot.get("top5", [])] if previous_snapshot else []

    by_ticker = {x["ticker"]: x for x in enriched}
    sorted_all = sorted(enriched, key=lambda x: x["stableScore"], reverse=True)

    retained = []
    removed = []
    for ticker in previous_top:
        item = by_ticker.get(ticker)
        if not item:
            removed.append({"ticker": ticker, "reason": "Dati non disponibili"})
            continue

        records = ticker_daily_records(history, ticker)
        degradation_days = consecutive(records, lambda x: finite(x.get("stableScore"), 10) < MIN_HOLD_SCORE)
        structural_break = (
            item["stableScore"] < STRUCTURAL_EXIT_SCORE or
            item["technical"]["weekly"] == "Ribassista" or
            item["qualityScore"] < 5.2 or
            item["newsScore"] <= 2
        )

        if structural_break:
            removed.append({"ticker": ticker, "reason": "Deterioramento strutturale"})
        elif degradation_days >= EXIT_DEGRADATION_DAYS:
            removed.append({"ticker": ticker, "reason": f"Sotto soglia da {degradation_days} giorni"})
        else:
            retained.append(item)

    challengers = [x for x in sorted_all if x["ticker"] not in {r["ticker"] for r in retained}]
    while len(retained) < 5 and challengers:
        candidate = challengers.pop(0)
        records = ticker_daily_records(history, candidate["ticker"])
        confirmation_days = consecutive(records, lambda x: finite(x.get("stableScore"), 0) >= MIN_ENTRY_SCORE)
        # Il giorno corrente vale come ulteriore conferma.
        confirmation_days += 1 if candidate["stableScore"] >= MIN_ENTRY_SCORE else 0

        if not previous_top:
            # Bootstrap iniziale: accetta i migliori, poi da domani applica la rigidità.
            retained.append(candidate)
            continue

        if candidate["stableScore"] < MIN_ENTRY_SCORE:
            continue
        if confirmation_days < ENTRY_CONFIRMATION_DAYS:
            continue

        retained.append(candidate)

    # Possibile sostituzione solo con margine importante.
    final_top = retained[:]
    outsiders = [x for x in sorted_all if x["ticker"] not in {r["ticker"] for r in final_top}]
    changed = True
    while changed and outsiders and final_top:
        changed = False
        outsider = outsiders[0]
        outsider_records = ticker_daily_records(history, outsider["ticker"])
        confirmation_days = consecutive(
            outsider_records,
            lambda x: finite(x.get("stableScore"), 0) >= MIN_ENTRY_SCORE
        ) + (1 if outsider["stableScore"] >= MIN_ENTRY_SCORE else 0)

        weakest_index = min(range(len(final_top)), key=lambda i: final_top[i]["stableScore"])
        weakest = final_top[weakest_index]
        required_margin = TOP3_ENTRY_MARGIN if weakest_index < 3 else ENTRY_MARGIN

        if (
            confirmation_days >= ENTRY_CONFIRMATION_DAYS and
            outsider["stableScore"] >= weakest["stableScore"] + required_margin
        ):
            removed.append({
                "ticker": weakest["ticker"],
                "reason": f"Superata di {outsider['stableScore'] - weakest['stableScore']:.2f} punti"
            })
            final_top[weakest_index] = outsider
            outsiders.pop(0)
            changed = True

    final_top = sorted(final_top, key=lambda x: x["stableScore"], reverse=True)[:5]

    for rank, item in enumerate(final_top, 1):
        item["rank"] = rank
        previous_rank = item["memory"].get("previousRank")
        item["rankChange"] = (
            None if previous_rank is None else previous_rank - rank
        )
        item["isNewEntry"] = item["ticker"] not in previous_top

    current_tickers = [x["ticker"] for x in final_top]
    changes = {
        "date": today,
        "entered": [x["ticker"] for x in final_top if x["ticker"] not in previous_top],
        "exited": [x for x in previous_top if x not in current_tickers],
        "removedReasons": removed,
        "unchangedCount": len(set(previous_top) & set(current_tickers)),
    }
    return final_top, changes


def update_validations(history: dict[str, Any], current_prices: dict[str, float]) -> list[dict[str, Any]]:
    validations = history.get("validations", [])
    existing_keys = {(x.get("selectionDate"), x.get("ticker"), x.get("horizonDays")) for x in validations}

    snapshots = unique_daily_snapshots(history.get("snapshots", []))
    today = date.today()

    for snapshot in snapshots:
        selection_date_text = snapshot.get("date")
        if not selection_date_text:
            continue
        try:
            age = (today - date.fromisoformat(selection_date_text)).days
        except Exception:
            continue

        for horizon in (20, 60, 90):
            if age < horizon:
                continue
            for item in snapshot.get("top5", []):
                ticker = item.get("ticker")
                key = (selection_date_text, ticker, horizon)
                if key in existing_keys or ticker not in current_prices:
                    continue
                start_price = finite(item.get("price"))
                end_price = finite(current_prices.get(ticker))
                if not start_price or not end_price:
                    continue
                return_pct = (end_price / start_price - 1) * 100
                validations.append({
                    "selectionDate": selection_date_text,
                    "ticker": ticker,
                    "horizonDays": horizon,
                    "startPrice": start_price,
                    "endPrice": end_price,
                    "returnPct": return_pct,
                    "positive": return_pct > 0,
                    "validatedAt": today.isoformat(),
                })
                existing_keys.add(key)

    return validations[-1000:]


def validation_summary(validations: list[dict[str, Any]]) -> dict[str, Any]:
    result = {}
    for horizon in (20, 60, 90):
        rows = [x for x in validations if x.get("horizonDays") == horizon]
        result[str(horizon)] = {
            "samples": len(rows),
            "positivePct": (
                sum(1 for x in rows if x.get("positive")) / len(rows) * 100
                if rows else None
            ),
            "averageReturnPct": (
                mean([finite(x.get("returnPct"), 0) for x in rows])
                if rows else None
            )
        }
    return result


def build_investment_section(history: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    screened = quick_investment_screen()

    # Include i migliori 30 e tutte le precedenti Top5, così non possono sparire per mancato approfondimento.
    previous_snapshots = unique_daily_snapshots(history.get("snapshots", []))
    previous_top = [x["ticker"] for x in previous_snapshots[-1].get("top5", [])] if previous_snapshots else []
    selected_bases = screened[:30]
    selected_tickers = {x["ticker"] for x in selected_bases}
    selected_bases.extend([x for x in screened if x["ticker"] in previous_top and x["ticker"] not in selected_tickers])

    enriched = []
    for index, base in enumerate(selected_bases, 1):
        print(f"Approfondimento [{index}/{len(selected_bases)}] {base['ticker']}", flush=True)
        try:
            enriched.append(enrich_candidate(base, history))
        except Exception as exc:
            print(f"Errore {base['ticker']}: {type(exc).__name__}: {exc}", flush=True)

    top5, changes = rank_with_hysteresis(enriched, history)
    return {
        "screenedCount": len(screened),
        "universeCount": len(INVESTMENT_TICKERS),
        "candidates": top5,
        "changes": changes,
        "rules": {
            "todayWeightPct": 30,
            "historyWeightPct": 70,
            "entryConfirmationDays": ENTRY_CONFIRMATION_DAYS,
            "exitDegradationDays": EXIT_DEGRADATION_DAYS,
            "entryMargin": ENTRY_MARGIN,
            "top3EntryMargin": TOP3_ENTRY_MARGIN,
            "loyaltyBonusMax": LOYALTY_BONUS_MAX,
        }
    }, enriched


def main() -> int:
    generated_at = datetime.now(timezone.utc).isoformat()
    today = date.today().isoformat()
    history = load_history()

    trading_payload = {
        "provider": "Yahoo Finance tramite yfinance",
        "generatedAt": generated_at,
        "assets": [],
    }

    successful_assets = 0
    for asset in TRADING_ASSETS:
        result = fetch_trading_asset(asset)
        trading_payload["assets"].append(result)
        if all(len(result["timeframes"].get(tf, [])) >= 20 for tf in ("1M","1W","1D","4H","1H")):
            successful_assets += 1

    try:
        investment_payload, enriched = build_investment_section(history)
    except Exception as exc:
        print(f"Investment non aggiornato: {type(exc).__name__}: {exc}", flush=True)
        investment_payload = {
            "screenedCount": 0, "universeCount": len(INVESTMENT_TICKERS),
            "candidates": [], "changes": {}, "error": f"{type(exc).__name__}: {exc}"
        }
        enriched = []

    current_prices = {x["ticker"]: x["currentPrice"] for x in enriched}
    history["validations"] = update_validations(history, current_prices)

    universe_snapshot = []
    top_tickers = {x["ticker"] for x in investment_payload.get("candidates", [])}
    for rank, item in enumerate(sorted(enriched, key=lambda x: x["stableScore"], reverse=True), 1):
        universe_snapshot.append({
            "ticker": item["ticker"], "rank": rank,
            "rawScore": item["rawScore"], "stableScore": item["stableScore"],
            "status": item["status"], "inTop5": item["ticker"] in top_tickers,
            "price": item["currentPrice"],
        })

    top5_snapshot = [{
        "ticker": item["ticker"], "rank": item.get("rank"),
        "score": item["stableScore"], "price": item["currentPrice"],
        "status": item["status"]
    } for item in investment_payload.get("candidates", [])]

    # Una sola fotografia per giorno: gli aggiornamenti intraday sostituiscono quella precedente.
    snapshots = [x for x in history.get("snapshots", []) if x.get("date") != today]
    snapshots.append({
        "date": today, "generatedAt": generated_at,
        "top5": top5_snapshot, "universe": universe_snapshot,
        "changes": investment_payload.get("changes", {})
    })
    history["snapshots"] = snapshots[-HISTORY_DAYS:]
    history["schemaVersion"] = 10
    history["updatedAt"] = generated_at

    investment_payload["validationSummary"] = validation_summary(history["validations"])
    investment_payload["historyDays"] = len(unique_daily_snapshots(history["snapshots"]))

    combined = {
        **trading_payload,
        "investment": {
            "provider": "Yahoo Finance tramite yfinance",
            "generatedAt": generated_at,
            **investment_payload,
        },
        "schemaVersion": 10,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8")
    HISTORY_OUTPUT.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"Scritto {OUTPUT}. Trading {successful_assets}/{len(TRADING_ASSETS)}. "
        f"Investment {len(investment_payload.get('candidates', []))}. "
        f"Storico {investment_payload.get('historyDays', 0)} giorni.",
        flush=True
    )
    return 0 if successful_assets > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
