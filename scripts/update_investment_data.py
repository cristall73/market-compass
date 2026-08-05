from __future__ import annotations
import json, math, re, sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import numpy as np
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "investing" / "data" / "investment-data.json"

# 120+ liquid large caps across USA and Europe.
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

NEGATIVE_WORDS = {"miss","cuts","cut","warning","probe","lawsuit","ban","recall","weak","decline","downgrade","slump","risk","tariff","delay","investigation"}
POSITIVE_WORDS = {"beat","raises","raise","record","upgrade","growth","approval","buyback","launch","strong","surge","expands","contract","partnership"}

SECTOR_RISKS = {
"Technology":["Tassi elevati possono comprimere i multipli.","Restrizioni all'export e tensioni USA-Cina possono incidere sulla supply chain."],
"Semiconductors":["Rischio ciclico elevato e dipendenza dalla domanda AI/data center.","Taiwan, controlli export e concentrazione produttiva sono fattori geopolitici rilevanti."],
"Healthcare":["Rischio regolatorio e pressione sui prezzi dei farmaci.","Esiti clinici o approvazioni possono creare elevata volatilità."],
"Financial Services":["Sensibilità a tassi, curva dei rendimenti e qualità del credito.","Possibili rischi regolatori e di liquidità."],
"Consumer Cyclical":["Sensibilità a consumi, inflazione e mercato del lavoro.","Margini vulnerabili a costi e rallentamento economico."],
"Energy":["Sensibilità a petrolio, OPEC e geopolitica mediorientale.","Volatilità elevata delle materie prime."],
"Industrials":["Sensibilità al ciclo economico e agli investimenti aziendali.","Dazi e costi delle materie prime possono comprimere i margini."]
}

def finite(x, default=None):
    try:
        x=float(x)
        return x if math.isfinite(x) else default
    except Exception:
        return default

def pct(x):
    x=finite(x)
    return x*100 if x is not None and abs(x)<=3 else x

def score_range(value, bad, good):
    value=finite(value)
    if value is None:return 5
    if good==bad:return 5
    return max(0,min(10,(value-bad)/(good-bad)*10))

def rsi(series, period=14):
    delta=series.diff()
    gain=delta.clip(lower=0).rolling(period).mean()
    loss=(-delta.clip(upper=0)).rolling(period).mean()
    rs=gain/loss.replace(0,np.nan)
    return 100-(100/(1+rs))

def trend_label(price, ema50, ema200):
    if price>ema50>ema200:return "Rialzista"
    if price>ema200:return "Rialzista debole"
    if price<ema50<ema200:return "Ribassista"
    return "Neutrale"

def news_sentiment(news):
    score=0
    for item in news:
        text=(item.get("title") or "").lower()
        score += sum(1 for w in POSITIVE_WORDS if w in text)
        score -= sum(1 for w in NEGATIVE_WORDS if w in text)
    return max(-5,min(5,score))

def get_news(ticker_obj):
    result=[]
    try:
        raw=ticker_obj.news or []
        for item in raw[:8]:
            content=item.get("content",item)
            title=content.get("title") or item.get("title")
            publisher=(content.get("provider") or {}).get("displayName") if isinstance(content.get("provider"),dict) else item.get("publisher")
            if title:result.append({"title":title,"publisher":publisher})
    except Exception:
        pass
    return result

def classify_sector(info):
    sector=info.get("sector") or "Altro"
    industry=info.get("industry") or ""
    if "Semiconductor" in industry:return "Semiconductors"
    return sector

def analyze(ticker):
    obj=yf.Ticker(ticker)
    hist=obj.history(period="5y",interval="1d",auto_adjust=True)
    if hist.empty or len(hist)<260:return None
    close=hist["Close"].dropna()
    price=float(close.iloc[-1])
    high52=float(close.tail(252).max())
    pullback=(high52-price)/high52*100
    ema20=float(close.ewm(span=20).mean().iloc[-1])
    ema50=float(close.ewm(span=50).mean().iloc[-1])
    ema200=float(close.ewm(span=200).mean().iloc[-1])
    rsi_d=float(rsi(close).iloc[-1])
    ret3=(price/float(close.iloc[-63])-1)*100 if len(close)>=63 else 0
    vol=float(close.pct_change().tail(63).std()*math.sqrt(252)*100)
    atr=float(pd.concat([(hist.High-hist.Low),(hist.High-close.shift()).abs(),(hist.Low-close.shift()).abs()],axis=1).max(axis=1).rolling(14).mean().iloc[-1])

    weekly=close.resample("W").last()
    monthly=close.resample("ME").last()
    wt=trend_label(float(weekly.iloc[-1]),float(weekly.ewm(span=20).mean().iloc[-1]),float(weekly.ewm(span=50).mean().iloc[-1]))
    mt=trend_label(float(monthly.iloc[-1]),float(monthly.ewm(span=10).mean().iloc[-1]),float(monthly.ewm(span=20).mean().iloc[-1]))
    dt=trend_label(price,ema50,ema200)

    try: info=obj.info or {}
    except Exception: info={}
    name=info.get("longName") or info.get("shortName") or ticker
    sector=classify_sector(info)
    currency=info.get("currency") or ""

    rev=pct(info.get("revenueGrowth"))
    earn=pct(info.get("earningsGrowth"))
    margin=pct(info.get("operatingMargins"))
    roe=pct(info.get("returnOnEquity"))
    debt=finite(info.get("debtToEquity"))
    pe=finite(info.get("forwardPE"))
    fcf=finite(info.get("freeCashflow"))

    quality=np.mean([
        score_range(rev,-5,20),score_range(earn,-10,25),score_range(margin,5,35),
        score_range(roe,5,30),10-score_range(debt,30,250),
        10-score_range(pe,12,45) if pe else 5, 8 if fcf and fcf>0 else 2
    ])
    trend=np.mean([
        9 if mt=="Rialzista" else 6 if "debole" in mt else 3,
        9 if wt=="Rialzista" else 6 if "debole" in wt else 3,
        9 if dt=="Rialzista" else 6 if "debole" in dt else 3,
        score_range(ret3,-15,25)
    ])

    required_min=max(8,min(15,vol*0.32))
    required_max=max(required_min+3,min(22,vol*0.50))
    entry_score=10-abs(pullback-(required_min+required_max)/2)/max(1,(required_max-required_min)/2)*4
    entry_score=max(0,min(10,entry_score))
    if price<ema200:entry_score-=2
    if rsi_d>70:entry_score-=2
    entry_score=max(0,entry_score)

    news=get_news(obj)
    sentiment=news_sentiment(news)
    news_score=5+sentiment

    final=quality*.34+trend*.28+entry_score*.25+news_score*.13
    final=max(0,min(10,final))

    status="RED"
    if quality>=6.5 and trend>=6 and required_min<=pullback<=required_max and 40<=rsi_d<=62 and price>ema200 and sentiment>=-1:
        status="GREEN"
    elif quality>=6 and trend>=5.5 and pullback>=required_min*.55 and price>ema200 and sentiment>=-2:
        status="YELLOW"

    support=float(hist["Low"].tail(90).quantile(.12))
    resistance=float(hist["High"].tail(90).quantile(.90))
    entry_mid=high52*(1-(required_min+required_max)/200)
    entry_low=high52*(1-required_max/100)
    entry_high=high52*(1-required_min/100)
    watch_low=high52*(1-required_min*.85/100)
    watch_high=high52*(1-required_min*.45/100)
    invalid=min(entry_low-atr*1.2,ema200-atr*.5)
    risk=max(.01,entry_mid-invalid)
    target1=entry_mid+risk*1.2
    target2=entry_mid+risk*2
    target3=entry_mid+risk*3

    risks=list(SECTOR_RISKS.get(sector,["Rallentamento macroeconomico e compressione dei multipli."]))
    if sentiment<0:risks.append("Il flusso di notizie recente contiene elementi negativi da verificare.")
    if pe and pe>35:risks.append("Valutazione elevata rispetto a livelli generalmente considerati prudenti.")
    if debt and debt>150:risks.append("Leva finanziaria elevata.")
    catalysts=[]
    if rev and rev>10:catalysts.append(f"Crescita ricavi ancora sostenuta ({rev:.1f}%).")
    if earn and earn>10:catalysts.append(f"Crescita degli utili positiva ({earn:.1f}%).")
    if sentiment>0:catalysts.append("Flusso di notizie recente moderatamente favorevole.")
    catalysts.append("Possibile recupero tecnico verso i massimi se il supporto Daily regge.")

    diagnosis="Il ritracciamento appare prevalentemente tecnico e compatibile con una normale presa di profitto."
    if sentiment<=-2:diagnosis="Il ribasso coincide con notizie negative: non va considerato automaticamente un semplice sconto."
    elif price<ema200:diagnosis="Il ribasso ha compromesso la struttura Daily di lungo periodo e richiede prudenza."

    conditions=[]
    if pullback<required_min:conditions.append(f"Ritracciamento almeno al {required_min:.1f}%.")
    if rsi_d>62:conditions.append("RSI Daily sotto 62 o chiara stabilizzazione.")
    if dt=="Ribassista":conditions.append("Recupero della struttura Daily.")
    if sentiment<-1:conditions.append("Assenza di nuove notizie strutturalmente negative.")
    if quality<6.5:conditions.append("Miglioramento o conferma dei fondamentali.")
    if not conditions:conditions=["Conferma Daily di reazione nella zona prima dell'esecuzione."]

    earnings_date=None
    try:
        cal=obj.calendar
        if isinstance(cal,dict):
            ed=cal.get("Earnings Date")
            if isinstance(ed,list) and ed:earnings_date=str(ed[0])
    except Exception:pass

    summary=(f"{name} mantiene qualità {quality:.1f}/10 e trend {trend:.1f}/10. "
             f"Il titolo quota a -{pullback:.1f}% dal massimo a 52 settimane. "
             f"{'La zona è operativamente interessante.' if status=='GREEN' else 'Serve ancora prezzo o conferma migliore.'}")
    reason=(f"È entrata nella selezione per la combinazione fra solidità fondamentale, trend di medio periodo "
            f"e ritracciamento coerente con la volatilità storica. La selezione non dipende soltanto dal calo percentuale.")

    return {
      "ticker":ticker,"name":name,"sector":sector,"currency":currency,"currentPrice":price,
      "high52":high52,"pullbackPct":pullback,"requiredPullbackMin":required_min,"requiredPullbackMax":required_max,
      "qualityScore":quality,"trendScore":trend,"entryScore":entry_score,"newsScore":news_score,"finalScore":final,"status":status,
      "watchZoneLow":watch_low,"watchZoneHigh":watch_high,"entryZoneLow":entry_low,"entryZoneHigh":entry_high,
      "invalidation":invalid,"target1":target1,"target2":target2,"target3":target3,"riskReward":"1 : 2.0",
      "executiveSummary":summary,"selectionReason":reason,"pullbackDiagnosis":diagnosis,
      "catalysts":catalysts,"risks":risks,"news":news[:5],"conditionsForGreen":conditions,
      "fundamentals":{"revenueGrowthPct":rev,"earningsGrowthPct":earn,"operatingMarginPct":margin,"roePct":roe,
        "debtToEquity":debt,"forwardPE":pe,"freeCashFlowLabel":f"{fcf/1e9:.2f} mld" if fcf else None},
      "technical":{"monthly":mt,"weekly":wt,"daily":dt,"rsiDaily":rsi_d,"relativeStrength3mPct":ret3,
        "support":support,"resistance":resistance},
      "earningsCommentary":"Il sistema considera crescita, margini, guidance disponibile e prossima data degli utili. Verificare sempre il comunicato ufficiale.",
      "nextEarningsDate":earnings_date,"earningsSurprisePct":finite(info.get("earningsQuarterlyGrowth")),
      "estimateRevision":"Non disponibile in modo uniforme dalla fonte gratuita.",
      "scenarios":{
        "A":f"Attendere un ritorno fra {entry_low:.2f} e {entry_high:.2f} con stabilizzazione Daily.",
        "B":"Se rompe i massimi senza ritracciare, non inseguire: attendere una nuova base.",
        "C":f"Escludere il piano con chiusura Daily/Weekly sotto {invalid:.2f} o deterioramento fondamentale."
      }
    }

def main():
    results=[]
    for i,ticker in enumerate(TICKERS,1):
        print(f"[{i}/{len(TICKERS)}] {ticker}",flush=True)
        try:
            item=analyze(ticker)
            if item:results.append(item)
        except Exception as exc:
            print(f"Errore {ticker}: {type(exc).__name__}: {exc}",flush=True)

    # Hard filter: quality/trend first, then top 5. Keep some yellow/green where possible.
    eligible=[x for x in results if x["qualityScore"]>=5.5 and x["trendScore"]>=5]
    eligible.sort(key=lambda x:x["finalScore"],reverse=True)
    top=eligible[:5]
    payload={"provider":"Yahoo Finance tramite yfinance","generatedAt":datetime.now(timezone.utc).isoformat(),
             "screenedCount":len(results),"universeCount":len(TICKERS),"candidates":top}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"Scritto {OUTPUT}: {len(results)} analizzate, {len(top)} candidate.")
    return 0 if results else 1

if __name__=="__main__":sys.exit(main())
