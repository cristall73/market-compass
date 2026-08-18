from __future__ import annotations

import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "investing" / "data" / "investment-data.json"

# Universo ampio ma concentrato su large cap liquide e negoziabili.
TICKERS = [
    "AAPL","MSFT","NVDA","AMZN","GOOGL","META","AVGO","TSLA","BRK-B","LLY","JPM","V","MA","WMT","XOM","ORCL","COST","NFLX","HD","PG",
    "JNJ","ABBV","BAC","KO","CRM","AMD","CSCO","PM","CVX","IBM","WFC","ABT","MCD","GE","CAT","DIS","QCOM","INTU","GS","AXP",
    "NOW","AMGN","ISRG","TXN","BKNG","PFE","TMO","LOW","RTX","SPGI","BLK","NEE","COP","UNH","UBER","ADBE","PANW","MU","AMAT","LRCX",
    "KLAC","SNPS","CDNS","ANET","PLTR","DE","HON","UPS","SBUX","MDT","SYK","GILD","VRTX","REGN","BSX","C","MS","SCHW","CB","MMC",
    "LIN","APD","ECL","NOC","LMT","GD","ETN","PH","WM","RSG","MAR","HLT","ABNB","NKE","TGT","TJX","ROST","PGR","AON","ICE",
    "ASML","SAP","NVO","TM","SONY","TSM","AZN","SHEL","BABA","MELI",
    "MC.PA","OR.PA","RMS.PA","SU.PA","AIR.PA","SIE.DE","ALV.DE","DTE.DE","MBG.DE","BMW.DE","IFX.DE","RACE.MI","ENEL.MI","ISP.MI","UCG.MI",
    "NESN.SW","NOVN.SW","ROG.SW","ULVR.L","HSBA.L","RIO.L","BP.L"
]

NEGATIVE_WORDS = {
    "miss", "cuts", "cut", "warning", "probe", "lawsuit", "ban", "recall",
    "weak", "decline", "downgrade", "slump", "risk", "tariff", "delay",
    "investigation", "lower", "falls", "fraud", "sanction"
}
POSITIVE_WORDS = {
    "beat", "raises", "raise", "record", "upgrade", "growth", "approval",
    "buyback", "launch", "strong", "surge", "expands", "contract", "partnership"
}

SECTOR_RISKS = {
    "Technology": [
        "Tassi elevati possono comprimere i multipli di valutazione.",
        "Restrizioni all'export e tensioni USA-Cina possono incidere sulla supply chain.",
    ],
    "Semiconductors": [
        "Rischio ciclico elevato e dipendenza dalla domanda AI e data center.",
        "Taiwan, controlli all'export e concentrazione produttiva sono fattori geopolitici rilevanti.",
    ],
    "Healthcare": [
        "Rischio regolatorio e pressione sui prezzi dei farmaci.",
        "Esiti clinici o approvazioni possono creare elevata volatilità.",
    ],
    "Financial Services": [
        "Sensibilità a tassi, curva dei rendimenti e qualità del credito.",
        "Possibili rischi regolatori e di liquidità.",
    ],
    "Consumer Cyclical": [
        "Sensibilità a consumi, inflazione e mercato del lavoro.",
        "Margini vulnerabili a costi e rallentamento economico.",
    ],
    "Energy": [
        "Sensibilità a petrolio, OPEC e geopolitica mediorientale.",
        "Volatilità elevata delle materie prime.",
    ],
    "Industrials": [
        "Sensibilità al ciclo economico e agli investimenti aziendali.",
        "Dazi e costi delle materie prime possono comprimere i margini.",
    ],
}


def finite(value: Any, default: float | None = None) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def as_percent(value: Any) -> float | None:
    number = finite(value)
    if number is None:
        return None
    return number * 100 if abs(number) <= 3 else number


def score_range(value: Any, bad: float, good: float, default: float = 5) -> float:
    number = finite(value)
    if number is None or good == bad:
        return default
    return max(0, min(10, (number - bad) / (good - bad) * 10))


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def trend_label(price: float, fast: float, slow: float) -> str:
    if price > fast > slow:
        return "Rialzista"
    if price > slow:
        return "Rialzista debole"
    if price < fast < slow:
        return "Ribassista"
    return "Neutrale"


def trend_numeric(label: str) -> float:
    return {
        "Rialzista": 9,
        "Rialzista debole": 6,
        "Neutrale": 4,
        "Ribassista": 2,
    }.get(label, 4)


def news_sentiment(news: list[dict[str, Any]]) -> int:
    score = 0
    for item in news:
        text = str(item.get("title") or "").lower()
        score += sum(1 for word in POSITIVE_WORDS if word in text)
        score -= sum(1 for word in NEGATIVE_WORDS if word in text)
    return max(-5, min(5, score))


def get_news(ticker_object: yf.Ticker) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    try:
        for item in (ticker_object.news or [])[:8]:
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


def classify_sector(info: dict[str, Any]) -> str:
    sector = info.get("sector") or "Altro"
    industry = info.get("industry") or ""
    return "Semiconductors" if "Semiconductor" in industry else sector


def get_frame(downloaded: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if downloaded.empty:
        return pd.DataFrame()
    if isinstance(downloaded.columns, pd.MultiIndex):
        try:
            frame = downloaded.xs(ticker, axis=1, level=1).copy()
        except KeyError:
            try:
                frame = downloaded[ticker].copy()
            except Exception:
                return pd.DataFrame()
    else:
        frame = downloaded.copy()
    required = ["Open", "High", "Low", "Close"]
    if not all(column in frame.columns for column in required):
        return pd.DataFrame()
    return frame.dropna(subset=["Close"])


def technical_screen(ticker: str, frame: pd.DataFrame) -> dict[str, Any] | None:
    if frame.empty or len(frame) < 260:
        return None
    close = frame["Close"].dropna()
    if len(close) < 260:
        return None

    price = float(close.iloc[-1])
    high52 = float(close.tail(252).max())
    pullback = (high52 - price) / high52 * 100 if high52 else 0
    ema50 = float(close.ewm(span=50, adjust=False).mean().iloc[-1])
    ema200 = float(close.ewm(span=200, adjust=False).mean().iloc[-1])
    rsi_daily = finite(rsi(close).iloc[-1], 50) or 50
    return3 = (price / float(close.iloc[-63]) - 1) * 100 if len(close) >= 63 else 0
    volatility = float(close.pct_change().tail(63).std() * math.sqrt(252) * 100)

    weekly = close.resample("W").last().dropna()
    monthly = close.resample("ME").last().dropna()
    if len(weekly) < 55 or len(monthly) < 22:
        return None

    weekly_label = trend_label(
        float(weekly.iloc[-1]),
        float(weekly.ewm(span=20, adjust=False).mean().iloc[-1]),
        float(weekly.ewm(span=50, adjust=False).mean().iloc[-1]),
    )
    monthly_label = trend_label(
        float(monthly.iloc[-1]),
        float(monthly.ewm(span=10, adjust=False).mean().iloc[-1]),
        float(monthly.ewm(span=20, adjust=False).mean().iloc[-1]),
    )
    daily_label = trend_label(price, ema50, ema200)

    trend_score = np.mean([
        trend_numeric(monthly_label),
        trend_numeric(weekly_label),
        trend_numeric(daily_label),
        score_range(return3, -15, 25),
    ])

    required_min = max(8, min(15, volatility * 0.32))
    required_max = max(required_min + 3, min(22, volatility * 0.50))
    midpoint = (required_min + required_max) / 2
    half_width = max(1, (required_max - required_min) / 2)
    entry_score = max(0, min(10, 10 - abs(pullback - midpoint) / half_width * 4))
    if price < ema200:
        entry_score -= 2
    if rsi_daily > 70:
        entry_score -= 2
    entry_score = max(0, entry_score)

    # La preselezione premia trend, qualità del ritracciamento e liquidità implicita large cap.
    pre_score = trend_score * 0.55 + entry_score * 0.35 + score_range(return3, -20, 20) * 0.10

    return {
        "ticker": ticker,
        "frame": frame,
        "price": price,
        "high52": high52,
        "pullback": pullback,
        "ema50": ema50,
        "ema200": ema200,
        "rsiDaily": rsi_daily,
        "return3": return3,
        "volatility": volatility,
        "monthly": monthly_label,
        "weekly": weekly_label,
        "daily": daily_label,
        "trendScore": float(trend_score),
        "entryScoreTechnical": float(entry_score),
        "requiredMin": float(required_min),
        "requiredMax": float(required_max),
        "preScore": float(pre_score),
    }


def detailed_analysis(screen: dict[str, Any]) -> dict[str, Any]:
    ticker = screen["ticker"]
    frame = screen["frame"]
    obj = yf.Ticker(ticker)

    try:
        info = obj.info or {}
    except Exception:
        info = {}

    name = info.get("longName") or info.get("shortName") or ticker
    sector = classify_sector(info)
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
        10 - score_range(debt_to_equity, 30, 250),
        10 - score_range(forward_pe, 12, 45) if forward_pe else 5,
        8 if free_cash_flow and free_cash_flow > 0 else 2,
    ]))

    news = get_news(obj)
    sentiment = news_sentiment(news)
    news_score = 5 + sentiment

    trend_score = screen["trendScore"]
    entry_score = screen["entryScoreTechnical"]
    final_score = max(0, min(10,
        quality_score * 0.34 + trend_score * 0.28 + entry_score * 0.25 + news_score * 0.13
    ))

    pullback = screen["pullback"]
    required_min = screen["requiredMin"]
    required_max = screen["requiredMax"]
    price = screen["price"]
    high52 = screen["high52"]
    rsi_daily = screen["rsiDaily"]

    status = "RED"
    if (
        quality_score >= 6.5 and trend_score >= 6 and
        required_min <= pullback <= required_max and
        40 <= rsi_daily <= 62 and price > screen["ema200"] and sentiment >= -1
    ):
        status = "GREEN"
    elif (
        quality_score >= 6 and trend_score >= 5.5 and
        pullback >= required_min * 0.55 and
        price > screen["ema200"] and sentiment >= -2
    ):
        status = "YELLOW"

    high = frame["High"].dropna()
    low = frame["Low"].dropna()
    close = frame["Close"].dropna()
    support = float(low.tail(90).quantile(0.12))
    resistance = float(high.tail(90).quantile(0.90))
    true_range = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs(),
    ], axis=1).max(axis=1)
    atr = float(true_range.rolling(14).mean().iloc[-1])

    entry_mid = high52 * (1 - (required_min + required_max) / 200)
    entry_low = high52 * (1 - required_max / 100)
    entry_high = high52 * (1 - required_min / 100)
    watch_low = high52 * (1 - required_min * 0.85 / 100)
    watch_high = high52 * (1 - required_min * 0.45 / 100)
    invalidation = min(entry_low - atr * 1.2, screen["ema200"] - atr * 0.5)
    risk = max(0.01, entry_mid - invalidation)
    target1 = entry_mid + risk * 1.2
    target2 = entry_mid + risk * 2
    target3 = entry_mid + risk * 3

    risks = list(SECTOR_RISKS.get(sector, [
        "Rallentamento macroeconomico e compressione dei multipli.",
    ]))
    if sentiment < 0:
        risks.append("Il flusso di notizie recente contiene elementi negativi da verificare.")
    if forward_pe and forward_pe > 35:
        risks.append("Valutazione elevata rispetto a livelli generalmente considerati prudenti.")
    if debt_to_equity and debt_to_equity > 150:
        risks.append("Leva finanziaria elevata.")

    catalysts: list[str] = []
    if revenue_growth and revenue_growth > 10:
        catalysts.append(f"Crescita dei ricavi ancora sostenuta ({revenue_growth:.1f}%).")
    if earnings_growth and earnings_growth > 10:
        catalysts.append(f"Crescita degli utili positiva ({earnings_growth:.1f}%).")
    if sentiment > 0:
        catalysts.append("Flusso di notizie recente moderatamente favorevole.")
    catalysts.append("Possibile recupero tecnico verso i massimi se il supporto Daily regge.")

    diagnosis = "Il ritracciamento appare prevalentemente tecnico e compatibile con una normale presa di profitto."
    if sentiment <= -2:
        diagnosis = "Il ribasso coincide con notizie negative: non va considerato automaticamente un semplice sconto."
    elif price < screen["ema200"]:
        diagnosis = "Il ribasso ha compromesso la struttura Daily di lungo periodo e richiede prudenza."

    conditions: list[str] = []
    if pullback < required_min:
        conditions.append(f"Ritracciamento almeno al {required_min:.1f}%.")
    if rsi_daily > 62:
        conditions.append("RSI Daily sotto 62 oppure chiara stabilizzazione.")
    if screen["daily"] == "Ribassista":
        conditions.append("Recupero della struttura Daily.")
    if sentiment < -1:
        conditions.append("Assenza di nuove notizie strutturalmente negative.")
    if quality_score < 6.5:
        conditions.append("Miglioramento o conferma dei fondamentali.")
    if not conditions:
        conditions.append("Conferma Daily di reazione nella zona prima dell'esecuzione.")

    earnings_date = None
    try:
        calendar = obj.calendar
        if isinstance(calendar, dict):
            raw_date = calendar.get("Earnings Date")
            if isinstance(raw_date, list) and raw_date:
                earnings_date = str(raw_date[0])
            elif raw_date is not None:
                earnings_date = str(raw_date)
    except Exception:
        pass

    summary = (
        f"{name} mantiene qualità {quality_score:.1f}/10 e trend {trend_score:.1f}/10. "
        f"Il titolo quota a -{pullback:.1f}% dal massimo a 52 settimane. "
        + ("La zona è operativamente interessante." if status == "GREEN" else "Serve ancora prezzo o conferma migliore.")
    )

    return {
        "ticker": ticker,
        "name": name,
        "sector": sector,
        "currency": currency,
        "currentPrice": price,
        "high52": high52,
        "pullbackPct": pullback,
        "requiredPullbackMin": required_min,
        "requiredPullbackMax": required_max,
        "qualityScore": quality_score,
        "trendScore": trend_score,
        "entryScore": entry_score,
        "newsScore": news_score,
        "finalScore": final_score,
        "status": status,
        "watchZoneLow": watch_low,
        "watchZoneHigh": watch_high,
        "entryZoneLow": entry_low,
        "entryZoneHigh": entry_high,
        "invalidation": invalidation,
        "target1": target1,
        "target2": target2,
        "target3": target3,
        "riskReward": "1 : 2.0",
        "executiveSummary": summary,
        "selectionReason": (
            "È entrata nella selezione per la combinazione fra solidità fondamentale, "
            "trend di medio periodo e ritracciamento coerente con la volatilità storica. "
            "La selezione non dipende soltanto dal calo percentuale."
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
            "freeCashFlowLabel": f"{free_cash_flow / 1e9:.2f} mld" if free_cash_flow else None,
        },
        "technical": {
            "monthly": screen["monthly"],
            "weekly": screen["weekly"],
            "daily": screen["daily"],
            "rsiDaily": rsi_daily,
            "relativeStrength3mPct": screen["return3"],
            "support": support,
            "resistance": resistance,
        },
        "earningsCommentary": (
            "Il sistema considera crescita, margini, guidance disponibile e prossima data degli utili. "
            "Verificare sempre il comunicato ufficiale e la conference call."
        ),
        "nextEarningsDate": earnings_date,
        "earningsSurprisePct": as_percent(info.get("earningsQuarterlyGrowth")),
        "estimateRevision": "Non disponibile in modo uniforme dalla fonte gratuita.",
        "scenarios": {
            "A": f"Attendere un ritorno fra {entry_low:.2f} e {entry_high:.2f} con stabilizzazione Daily.",
            "B": "Se rompe i massimi senza ritracciare, non inseguire: attendere una nuova base.",
            "C": f"Escludere il piano con chiusura Daily o Weekly sotto {invalidation:.2f}, oppure con deterioramento fondamentale.",
        },
    }


def main() -> int:
    print(f"Scarico in blocco lo storico di {len(TICKERS)} large cap...", flush=True)
    downloaded = yf.download(
        TICKERS,
        period="5y",
        interval="1d",
        auto_adjust=True,
        group_by="column",
        progress=False,
        threads=True,
        timeout=60,
    )

    screened: list[dict[str, Any]] = []
    for ticker in TICKERS:
        try:
            result = technical_screen(ticker, get_frame(downloaded, ticker))
            if result:
                screened.append(result)
        except Exception as exc:
            print(f"Pre-filtro {ticker}: {type(exc).__name__}: {exc}", flush=True)

    screened.sort(key=lambda item: item["preScore"], reverse=True)
    shortlist = screened[:24]
    print(f"Pre-filtro completato: {len(screened)} valide; approfondisco {len(shortlist)} candidate.", flush=True)

    detailed: list[dict[str, Any]] = []
    for index, item in enumerate(shortlist, 1):
        ticker = item["ticker"]
        print(f"[{index}/{len(shortlist)}] Fondamentali e notizie: {ticker}", flush=True)
        try:
            detailed.append(detailed_analysis(item))
        except Exception as exc:
            print(f"Approfondimento {ticker}: {type(exc).__name__}: {exc}", flush=True)
        time.sleep(0.25)

    eligible = [
        item for item in detailed
        if item["qualityScore"] >= 5.5 and item["trendScore"] >= 5
    ]
    eligible.sort(
        key=lambda item: (
            {"GREEN": 3, "YELLOW": 2, "RED": 1}.get(item["status"], 0),
            item["finalScore"],
        ),
        reverse=True,
    )
    top = eligible[:5]

    payload = {
        "provider": "Yahoo Finance tramite yfinance",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "screenedCount": len(screened),
        "universeCount": len(TICKERS),
        "detailedCount": len(detailed),
        "candidates": top,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Scritto {OUTPUT}: {len(screened)} esaminate, {len(top)} candidate finali.", flush=True)
    return 0 if screened and top else 1


if __name__ == "__main__":
    sys.exit(main())
