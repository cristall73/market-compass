from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]

# IMPORTANTE:
# il workflow già presente nel repository salva e committa questo file.
# Dentro lo stesso JSON vengono pubblicati sia Trading sia Investment Coach.
OUTPUT = ROOT / "data" / "market-data.json"

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

# Oltre 120 large cap liquide.
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
    "miss", "cuts", "cut", "warning", "probe", "lawsuit", "ban", "recall",
    "weak", "decline", "downgrade", "slump", "risk", "tariff", "delay",
    "investigation", "fraud", "sanction", "lower"
}
POSITIVE_WORDS = {
    "beat", "raises", "raise", "record", "upgrade", "growth", "approval",
    "buyback", "launch", "strong", "surge", "expands", "contract", "partnership"
}

SECTOR_RISKS = {
    "Technology": [
        "Tassi elevati possono comprimere i multipli.",
        "Restrizioni all'export e tensioni USA-Cina possono incidere sulla filiera.",
    ],
    "Semiconductors": [
        "Settore ciclico e dipendente dalla domanda AI e data center.",
        "Taiwan e controlli all'export sono fattori geopolitici rilevanti.",
    ],
    "Healthcare": [
        "Rischio regolatorio e pressione sui prezzi.",
        "Studi clinici e approvazioni possono aumentare la volatilità.",
    ],
    "Financial Services": [
        "Sensibilità a tassi, curva dei rendimenti e qualità del credito.",
        "Rischi regolatori e di liquidità.",
    ],
    "Consumer Cyclical": [
        "Sensibilità a consumi, inflazione e mercato del lavoro.",
        "Margini vulnerabili al rallentamento economico.",
    ],
    "Energy": [
        "Sensibilità a petrolio, OPEC e geopolitica.",
        "Elevata volatilità delle materie prime.",
    ],
    "Industrials": [
        "Sensibilità al ciclo economico e agli investimenti.",
        "Dazi e costi delle materie prime possono comprimere i margini.",
    ],
}


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


def yf_download(ticker: str, period: str, interval: str) -> pd.DataFrame:
    return yf.download(
        ticker,
        period=period,
        interval=interval,
        auto_adjust=False,
        progress=False,
        threads=False,
        timeout=30,
    )


def fetch_trading_asset(asset: dict[str, str]) -> dict[str, Any]:
    ticker = asset["yahoo"]
    timeframes: dict[str, list[dict[str, Any]]] = {}
    errors: list[str] = []
    hourly_frame = pd.DataFrame()

    for timeframe, options in TRADING_DOWNLOADS.items():
        try:
            frame = normalize_frame(
                yf_download(ticker, options["period"], options["interval"])
            )
            if timeframe == "1H":
                hourly_frame = frame
            candles = serialize(frame, options["limit"])
            if len(candles) < 20:
                errors.append(f"{timeframe}: dati insufficienti ({len(candles)})")
            timeframes[timeframe] = candles
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
    return 100 - (100 / (1 + rs))


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
    return {
        "Rialzista": 9,
        "Rialzista debole": 6,
        "Neutrale": 4,
        "Ribassista": 2,
    }.get(label, 4)


def quick_investment_screen() -> list[dict[str, Any]]:
    print(f"Screening tecnico di {len(INVESTMENT_TICKERS)} large cap...", flush=True)

    downloaded = yf.download(
        INVESTMENT_TICKERS,
        period="3y",
        interval="1d",
        auto_adjust=True,
        progress=False,
        group_by="ticker",
        threads=True,
        timeout=90,
    )

    screened: list[dict[str, Any]] = []

    for ticker in INVESTMENT_TICKERS:
        try:
            frame = downloaded[ticker] if isinstance(downloaded.columns, pd.MultiIndex) else downloaded
            if frame is None or frame.empty or "Close" not in frame:
                continue

            close = frame["Close"].dropna()
            high = frame["High"].dropna()
            low = frame["Low"].dropna()
            if len(close) < 260:
                continue

            price = float(close.iloc[-1])
            high52 = float(close.tail(252).max())
            pullback = (high52 - price) / high52 * 100

            ema20 = float(close.ewm(span=20).mean().iloc[-1])
            ema50 = float(close.ewm(span=50).mean().iloc[-1])
            ema200 = float(close.ewm(span=200).mean().iloc[-1])
            rsi_daily = finite(rsi(close).iloc[-1], 50) or 50
            return3m = (price / float(close.iloc[-63]) - 1) * 100

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

            volatility = float(close.pct_change().tail(63).std() * math.sqrt(252) * 100)
            required_min = max(8, min(15, volatility * 0.32))
            required_max = max(required_min + 3, min(22, volatility * 0.50))

            trend_score = float(np.mean([
                trend_number(monthly_trend),
                trend_number(weekly_trend),
                trend_number(daily_trend),
                score_range(return3m, -15, 25),
            ]))

            midpoint = (required_min + required_max) / 2
            half_range = max(1, (required_max - required_min) / 2)
            entry_score = 10 - abs(pullback - midpoint) / half_range * 4
            entry_score = max(0, min(10, entry_score))
            if price < ema200:
                entry_score -= 2
            if rsi_daily > 70:
                entry_score -= 2
            entry_score = max(0, entry_score)

            # Punteggio preliminare: privilegia trend crescente e ritracciamento sano.
            preliminary = trend_score * 0.58 + entry_score * 0.42
            if monthly_trend == "Ribassista" or weekly_trend == "Ribassista":
                preliminary -= 2

            atr = pd.concat([
                high - low,
                (high - close.shift()).abs(),
                (low - close.shift()).abs(),
            ], axis=1).max(axis=1).rolling(14).mean().iloc[-1]

            screened.append({
                "ticker": ticker,
                "price": price,
                "high52": high52,
                "pullbackPct": pullback,
                "requiredPullbackMin": required_min,
                "requiredPullbackMax": required_max,
                "trendScore": trend_score,
                "entryScore": entry_score,
                "preliminaryScore": max(0, min(10, preliminary)),
                "rsiDaily": rsi_daily,
                "return3m": return3m,
                "volatility": volatility,
                "ema200": ema200,
                "monthlyTrend": monthly_trend,
                "weeklyTrend": weekly_trend,
                "dailyTrend": daily_trend,
                "support": float(low.tail(90).quantile(0.12)),
                "resistance": float(high.tail(90).quantile(0.90)),
                "atr": float(atr),
            })
        except Exception as exc:
            print(f"Screening {ticker}: {type(exc).__name__}: {exc}", flush=True)

    screened.sort(key=lambda item: item["preliminaryScore"], reverse=True)
    return screened


def as_percent(value: Any) -> float | None:
    number = finite(value)
    if number is None:
        return None
    return number * 100 if abs(number) <= 3 else number


def get_news(ticker_object: yf.Ticker) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    try:
        for item in (ticker_object.news or [])[:6]:
            content = item.get("content", item)
            title = content.get("title") or item.get("title")
            provider = content.get("provider")
            publisher = (
                provider.get("displayName")
                if isinstance(provider, dict)
                else item.get("publisher")
            )
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
    industry = info.get("industry") or ""
    if "Semiconductor" in industry:
        return "Semiconductors"
    return sector


def enrich_candidate(base: dict[str, Any]) -> dict[str, Any]:
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

    final_score = (
        quality_score * 0.34
        + base["trendScore"] * 0.28
        + base["entryScore"] * 0.25
        + news_score * 0.13
    )
    final_score = max(0, min(10, final_score))

    status = "RED"
    if (
        quality_score >= 6.5
        and base["trendScore"] >= 6
        and base["requiredPullbackMin"] <= base["pullbackPct"] <= base["requiredPullbackMax"]
        and 40 <= base["rsiDaily"] <= 62
        and base["price"] > base["ema200"]
        and sentiment >= -1
    ):
        status = "GREEN"
    elif (
        quality_score >= 6
        and base["trendScore"] >= 5.5
        and base["pullbackPct"] >= base["requiredPullbackMin"] * 0.55
        and base["price"] > base["ema200"]
        and sentiment >= -2
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

    risks = list(SECTOR_RISKS.get(
        sector,
        ["Rallentamento macroeconomico e compressione dei multipli."]
    ))
    if sentiment < 0:
        risks.append("Le notizie recenti contengono elementi negativi da verificare.")
    if forward_pe and forward_pe > 35:
        risks.append("Valutazione elevata rispetto a livelli generalmente prudenti.")
    if debt_to_equity and debt_to_equity > 150:
        risks.append("Leva finanziaria elevata.")

    catalysts: list[str] = []
    if revenue_growth and revenue_growth > 10:
        catalysts.append(f"Crescita ricavi sostenuta ({revenue_growth:.1f}%).")
    if earnings_growth and earnings_growth > 10:
        catalysts.append(f"Crescita degli utili positiva ({earnings_growth:.1f}%).")
    if sentiment > 0:
        catalysts.append("Flusso di notizie recente moderatamente favorevole.")
    catalysts.append("Possibile recupero verso i massimi se il supporto Daily regge.")

    diagnosis = (
        "Il ritracciamento appare prevalentemente tecnico e compatibile "
        "con una normale presa di profitto."
    )
    if sentiment <= -2:
        diagnosis = (
            "Il ribasso coincide con notizie negative: non va considerato "
            "automaticamente un semplice sconto."
        )
    elif base["price"] < base["ema200"]:
        diagnosis = (
            "Il ribasso ha compromesso la struttura Daily di lungo periodo "
            "e richiede prudenza."
        )

    conditions: list[str] = []
    if base["pullbackPct"] < base["requiredPullbackMin"]:
        conditions.append(
            f"Ritracciamento almeno al {base['requiredPullbackMin']:.1f}%."
        )
    if base["rsiDaily"] > 62:
        conditions.append("RSI Daily sotto 62 o chiara stabilizzazione.")
    if base["dailyTrend"] == "Ribassista":
        conditions.append("Recupero della struttura Daily.")
    if sentiment < -1:
        conditions.append("Assenza di nuove notizie strutturalmente negative.")
    if quality_score < 6.5:
        conditions.append("Miglioramento o conferma dei fondamentali.")
    if not conditions:
        conditions.append("Conferma Daily di reazione nella zona prima dell'esecuzione.")

    next_earnings_date = None
    try:
        calendar = ticker_object.calendar
        if isinstance(calendar, dict):
            earnings_date = calendar.get("Earnings Date")
            if isinstance(earnings_date, list) and earnings_date:
                next_earnings_date = str(earnings_date[0])
    except Exception:
        pass

    summary = (
        f"{name} mantiene qualità {quality_score:.1f}/10 e trend "
        f"{base['trendScore']:.1f}/10. Il titolo quota a "
        f"-{base['pullbackPct']:.1f}% dal massimo a 52 settimane. "
        + (
            "La zona è operativamente interessante."
            if status == "GREEN"
            else "Serve ancora prezzo o conferma migliore."
        )
    )

    return {
        "ticker": ticker,
        "name": name,
        "sector": sector,
        "currency": currency,
        "currentPrice": base["price"],
        "high52": high52,
        "pullbackPct": base["pullbackPct"],
        "requiredPullbackMin": base["requiredPullbackMin"],
        "requiredPullbackMax": base["requiredPullbackMax"],
        "qualityScore": quality_score,
        "trendScore": base["trendScore"],
        "entryScore": base["entryScore"],
        "newsScore": news_score,
        "finalScore": final_score,
        "status": status,
        "watchZoneLow": watch_low,
        "watchZoneHigh": watch_high,
        "entryZoneLow": entry_low,
        "entryZoneHigh": entry_high,
        "invalidation": invalidation,
        "target1": entry_mid + risk * 1.2,
        "target2": entry_mid + risk * 2,
        "target3": entry_mid + risk * 3,
        "riskReward": "1 : 2.0",
        "executiveSummary": summary,
        "selectionReason": (
            "È entrata nella selezione per la combinazione fra solidità "
            "fondamentale, trend di medio periodo e ritracciamento coerente "
            "con la volatilità storica."
        ),
        "pullbackDiagnosis": diagnosis,
        "catalysts": catalysts,
        "risks": risks,
        "news": news[:5],
        "conditionsForGreen": conditions,
        "fundamentals": {
            "revenueGrowthPct": revenue_growth,
            "earningsGrowthPct": earnings_growth,
            "operatingMarginPct": operating_margin,
            "roePct": roe,
            "debtToEquity": debt_to_equity,
            "forwardPE": forward_pe,
            "freeCashFlowLabel": (
                f"{free_cash_flow / 1e9:.2f} mld"
                if free_cash_flow
                else None
            ),
        },
        "technical": {
            "monthly": base["monthlyTrend"],
            "weekly": base["weeklyTrend"],
            "daily": base["dailyTrend"],
            "rsiDaily": base["rsiDaily"],
            "relativeStrength3mPct": base["return3m"],
            "support": base["support"],
            "resistance": base["resistance"],
        },
        "earningsCommentary": (
            "Il sistema considera crescita, margini e dati disponibili. "
            "Verificare sempre il comunicato ufficiale e la conference call."
        ),
        "nextEarningsDate": next_earnings_date,
        "earningsSurprisePct": finite(info.get("earningsQuarterlyGrowth")),
        "estimateRevision": (
            "Non disponibile in modo uniforme dalla fonte gratuita."
        ),
        "scenarios": {
            "A": (
                f"Attendere un ritorno fra {entry_low:.2f} e {entry_high:.2f} "
                "con stabilizzazione Daily."
            ),
            "B": (
                "Se rompe i massimi senza ritracciare, non inseguire: "
                "attendere una nuova base."
            ),
            "C": (
                f"Escludere il piano con chiusura Daily o Weekly sotto "
                f"{invalidation:.2f}, oppure con deterioramento fondamentale."
            ),
        },
    }


def build_investment_section() -> dict[str, Any]:
    screened = quick_investment_screen()

    # Approfondiamo soltanto le migliori 24 per mantenere il workflow veloce.
    shortlist = screened[:24]
    enriched: list[dict[str, Any]] = []

    for index, base in enumerate(shortlist, 1):
        ticker = base["ticker"]
        print(f"Approfondimento [{index}/{len(shortlist)}] {ticker}", flush=True)
        try:
            enriched.append(enrich_candidate(base))
        except Exception as exc:
            print(f"Approfondimento {ticker}: {type(exc).__name__}: {exc}", flush=True)

    # Prima verdi, poi gialli, poi punteggio finale.
    status_priority = {"GREEN": 3, "YELLOW": 2, "RED": 1}
    enriched.sort(
        key=lambda item: (
            status_priority.get(item["status"], 0),
            item["finalScore"],
        ),
        reverse=True,
    )

    return {
        "screenedCount": len(screened),
        "universeCount": len(INVESTMENT_TICKERS),
        "candidates": enriched[:5],
    }


def main() -> int:
    generated_at = datetime.now(timezone.utc).isoformat()

    trading_payload = {
        "provider": "Yahoo Finance tramite yfinance",
        "generatedAt": generated_at,
        "assets": [],
    }

    successful_assets = 0
    for asset in TRADING_ASSETS:
        print(f"Trading: {asset['name']} ({asset['yahoo']})", flush=True)
        result = fetch_trading_asset(asset)
        trading_payload["assets"].append(result)

        if all(
            len(result["timeframes"].get(timeframe, [])) >= 20
            for timeframe in ("1M", "1W", "1D", "4H", "1H")
        ):
            successful_assets += 1

    try:
        investment_payload = build_investment_section()
    except Exception as exc:
        print(
            f"Investment Coach non aggiornato: {type(exc).__name__}: {exc}",
            flush=True,
        )
        investment_payload = {
            "screenedCount": 0,
            "universeCount": len(INVESTMENT_TICKERS),
            "candidates": [],
            "error": f"{type(exc).__name__}: {exc}",
        }

    combined_payload = {
        # Compatibilità con il Trading Coach precedente.
        **trading_payload,
        # Nuovo modulo Investment nello stesso file.
        "investment": {
            "provider": "Yahoo Finance tramite yfinance",
            "generatedAt": generated_at,
            **investment_payload,
        },
        "schemaVersion": 7,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(combined_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        f"Scritto {OUTPUT}. Trading completi: "
        f"{successful_assets}/{len(TRADING_ASSETS)}. "
        f"Investment candidate: {len(investment_payload.get('candidates', []))}.",
        flush=True,
    )

    return 0 if successful_assets > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
