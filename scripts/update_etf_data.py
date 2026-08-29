from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'etf-data.json'
MIN_HOLD_MONTHS = 12
PORTFOLIO_SIZE = 5

# Universo UCITS liquido e rappresentativo, quotato su LSE/Xetra.
ETFS = [
    ('SWDA.L','iShares Core MSCI World UCITS ETF','Azionario globale','IE00B4L5Y983','LSE:SWDA',0.20,'Fisica','Accumulo'),('VWCE.DE','Vanguard FTSE All-World UCITS ETF','Azionario globale','IE00BK5BQT80','XETR:VWCE',0.22,'Fisica','Accumulo'),('VWRL.L','Vanguard FTSE All-World UCITS ETF Dist','Azionario globale','IE00B3RBWM25','LSE:VWRL',0.22,'Fisica','Distribuzione'),('SSAC.L','iShares MSCI ACWI UCITS ETF','Azionario globale','IE00B6R52259','LSE:SSAC',0.20,'Fisica','Accumulo'),
    ('CSPX.L','iShares Core S&P 500 UCITS ETF','USA','IE00B5BMR087','LSE:CSPX',0.07,'Fisica','Accumulo'),('VUAA.L','Vanguard S&P 500 UCITS ETF','USA','IE00BFMXXD54','LSE:VUAA',0.07,'Fisica','Accumulo'),('IUSA.L','iShares Core S&P 500 UCITS ETF Dist','USA','IE0031442068','LSE:IUSA',0.07,'Fisica','Distribuzione'),
    ('EQQQ.L','Invesco EQQQ NASDAQ-100 UCITS ETF','Tecnologia / Nasdaq','IE0032077012','LSE:EQQQ',0.30,'Fisica','Distribuzione'),('CNDX.L','iShares NASDAQ 100 UCITS ETF','Tecnologia / Nasdaq','IE00B53SZB19','LSE:CNDX',0.33,'Fisica','Accumulo'),
    ('EXSA.DE','iShares STOXX Europe 600 UCITS ETF','Europa','DE0002635307','XETR:EXSA',0.20,'Fisica','Distribuzione'),('MEUD.L','Amundi STOXX Europe 600 UCITS ETF','Europa','LU0908500753','LSE:MEUD',0.07,'Fisica','Accumulo'),
    ('EIMI.L','iShares Core MSCI Emerging Markets IMI UCITS ETF','Emergenti','IE00BKM4GZ66','LSE:EIMI',0.18,'Fisica','Accumulo'),('VFEM.L','Vanguard FTSE Emerging Markets UCITS ETF','Emergenti','IE00B3VVMM84','LSE:VFEM',0.22,'Fisica','Distribuzione'),
    ('EUNA.DE','iShares Core Global Aggregate Bond UCITS ETF EUR Hedged','Obbligazionario globale','IE00BDBRDM35','XETR:EUNA',0.10,'Fisica','Accumulo'),('AGGH.L','iShares Core Global Aggregate Bond UCITS ETF','Obbligazionario globale','IE00BDBRDM35','LSE:AGGH',0.10,'Fisica','Accumulo'),
    ('SGLN.L','iShares Physical Gold ETC','Oro','IE00B4ND3602','LSE:SGLN',0.12,'Fisica','Accumulo'),('PHAU.L','WisdomTree Physical Gold','Oro','JE00B1VS3770','LSE:PHAU',0.39,'Fisica','Accumulo'),
    ('INRG.L','iShares Global Clean Energy Transition UCITS ETF','Tematico','IE00B1XNHC34','LSE:INRG',0.65,'Fisica','Distribuzione'),('RBOT.L','iShares Automation & Robotics UCITS ETF','Tematico','IE00BYZK4552','LSE:RBOT',0.40,'Fisica','Accumulo'),('IUIT.L','iShares S&P 500 Information Technology Sector UCITS ETF','Tecnologia','IE00B3WJKG14','LSE:IUIT',0.15,'Fisica','Accumulo'),
    ('MVOL.L','iShares Edge MSCI World Minimum Volatility UCITS ETF','Fattoriale difensivo','IE00B8FHGS14','LSE:MVOL',0.30,'Fisica','Accumulo'),('IWQU.L','iShares Edge MSCI World Quality Factor UCITS ETF','Fattoriale qualità','IE00BP3QZ601','LSE:IWQU',0.30,'Fisica','Accumulo')
]

DIV = {'Azionario globale':9.7,'USA':7.3,'Europa':8.2,'Tecnologia / Nasdaq':5.5,'Tecnologia':5.2,'Emergenti':7.2,'Obbligazionario globale':9.0,'Oro':6.5,'Tematico':4.5,'Fattoriale difensivo':8.0,'Fattoriale qualità':8.0}


def load_previous():
    try:
        return json.loads(OUT.read_text(encoding='utf-8'))
    except Exception:
        return {}


def finite(v, d=0):
    try:
        x = float(v)
        return x if math.isfinite(x) else d
    except Exception:
        return d


def cagr(s, years):
    if len(s) < 2:
        return None
    days = (s.index[-1] - s.index[0]).days / 365.25
    if days < years * .7:
        return None
    return ((float(s.iloc[-1]) / float(s.iloc[0])) ** (1 / days) - 1) * 100


def quote_meta(ticker, tv):
    currency = None
    try:
        fi = yf.Ticker(ticker).fast_info
        currency = fi.get('currency') if hasattr(fi, 'get') else getattr(fi, 'currency', None)
    except Exception:
        pass
    exchange = 'Xetra' if tv.startswith('XETR:') else 'London Stock Exchange' if tv.startswith('LSE:') else tv.split(':')[0]
    return currency, exchange


def role_from_category(cat):
    c = (cat or '').lower()
    if 'globale' in c and 'obbl' not in c:
        return 'CORE GLOBALE'
    if c == 'usa':
        return 'CRESCITA USA'
    if 'europa' in c:
        return 'DIVERSIFICAZIONE EUROPA'
    if 'tecnologia' in c or 'nasdaq' in c:
        return 'CRESCITA / TECNOLOGIA'
    if 'oro' in c:
        return 'DIFESA / ORO'
    if 'obbl' in c:
        return 'STABILIZZATORE'
    return 'DIVERSIFICAZIONE'


def monthly_series(c):
    # Ultima chiusura disponibile di ogni mese: il Daily non entra nella decisione ETF.
    p = c.groupby(c.index.to_period('M')).last()
    p.index = p.index.to_timestamp('M')
    return p.dropna()


def regime(close, fast_span, slow_span):
    if len(close) < slow_span + 3:
        return 'YELLOW', 5.0
    p = float(close.iloc[-1])
    fast = float(close.ewm(span=fast_span).mean().iloc[-1])
    slow = float(close.ewm(span=slow_span).mean().iloc[-1])
    if p > fast > slow:
        return 'GREEN', 8.5
    if p > slow:
        return 'YELLOW', 6.0
    if p < fast < slow:
        return 'RED', 2.5
    return 'YELLOW', 4.5


def analyse(t):
    ticker, name, cat, isin, tv, ter, repl, dist = t
    h = yf.download(ticker, period='10y', interval='1d', auto_adjust=True, progress=False)
    if h.empty:
        return None
    c = h['Close']
    c = c.iloc[:, 0] if isinstance(c, pd.DataFrame) else c
    c = c.dropna()
    if len(c) < 120:
        return None

    p = float(c.iloc[-1])
    dd = (c / c.cummax() - 1) * 100
    draw = float(dd.min())
    current = float(dd.iloc[-1])
    vol = float(c.pct_change().tail(252).std() * np.sqrt(252) * 100)
    r1 = (p / float(c.iloc[-252]) - 1) * 100 if len(c) >= 252 else None
    r3 = cagr(c.tail(min(len(c), 756)), 3)
    r5 = cagr(c.tail(min(len(c), 1260)), 5)
    r10 = cagr(c, 10)

    m = monthly_series(c)
    w = c.resample('W-FRI').last().dropna()
    monthly_regime, monthly_score = regime(m, 10, 20)
    weekly_regime, weekly_score = regime(w, 10, 40)
    trend = monthly_score * .70 + weekly_score * .30

    monthly = [{'date': idx.strftime('%Y-%m-%d'), 'price': round(float(v), 6)} for idx, v in m.items()]
    cost = max(0, min(10, 10 - ter * 15))
    rob = max(0, min(10, 6 + (finite(r5) - 5) / 5 - abs(draw) / 38 - vol / 55))
    structure = cost * .6 + 7.8 * .4
    div = DIV.get(cat, 7)
    score = structure * .35 + div * .25 + rob * .25 + trend * .15

    # Il PAC usa solo Mensile + Settimanale per il regime. Nessun filtro Daily.
    if monthly_regime == 'RED' and weekly_regime == 'RED':
        status, verdict = 'RED', 'TREND DI LUNGO PERIODO DA RIVEDERE'
    elif score >= 7.2 and monthly_regime == 'GREEN':
        status, verdict = 'GREEN', 'ADATTO AL PAC'
    else:
        status, verdict = 'YELLOW', 'MANTENERE / OSSERVARE'

    action = 'Mantieni la rata ordinaria.'
    if monthly_regime == 'RED' and weekly_regime == 'RED':
        action = 'Deterioramento Mensile + Settimanale: verifica uscita al controllo mensile.'
    elif current < -15 and monthly_regime != 'RED':
        action = 'Ritracciamento ampio ma trend lungo ancora valido: non uscire per rumore di breve.'
    elif current > -3 and trend > 8:
        action = 'Vicino ai massimi: continua il PAC senza aumentare la rata per inseguire il prezzo.'

    currency, exchange = quote_meta(ticker, tv)
    return {
        'ticker':ticker,'name':name,'category':cat,'role':role_from_category(cat),'isin':isin,'tvSymbol':tv,
        'exchange':exchange,'quoteCurrency':currency,'ter':ter,'replication':repl,'distribution':dist,
        'currentPrice':p,'return1y':r1,'return3y':r3,'return5y':r5,'return10y':r10,'drawdown':draw,
        'currentDrawdown':current,'volatility':vol,'monthlyRegime':monthly_regime,'weeklyRegime':weekly_regime,
        'monthlyTrendScore':monthly_score,'weeklyTrendScore':weekly_score,'trendScore':trend,'score':score,
        'status':status,'verdict':verdict,'pacAction':action,'monthlyHistory':monthly,
        'historyStart':monthly[0]['date'] if monthly else None,
        'summary':f'Costi {cost:.1f}/10 · diversificazione {div:.1f}/10 · robustezza {rob:.1f}/10 · trend lungo {trend:.1f}/10.'
    }


def initial_pick(items):
    ranked = sorted(items, key=lambda x: x['score'], reverse=True)
    chosen = []

    def add(x):
        if x and x['ticker'] not in {c['ticker'] for c in chosen} and len(chosen) < PORTFOLIO_SIZE:
            chosen.append(x)

    add(next((x for x in ranked if x['role'] == 'CORE GLOBALE' and x['status'] != 'RED'), None))
    add(next((x for x in ranked if x['role'] == 'DIVERSIFICAZIONE EUROPA' and x['status'] != 'RED'), None))
    add(next((x for x in ranked if x['role'] == 'DIFESA / ORO' and x['status'] != 'RED'), None))
    for x in ranked:
        if x['status'] != 'RED' and x['role'] != 'STABILIZZATORE':
            add(x)
    for x in ranked:
        if x['status'] != 'RED':
            add(x)
    return chosen[:PORTFOLIO_SIZE]


def months_between(a, b):
    try:
        da, db = datetime.fromisoformat(a[:10]), datetime.fromisoformat(b[:10])
        return max(0, (db.year - da.year) * 12 + db.month - da.month)
    except Exception:
        return 0


def build_portfolio(items, previous, now):
    by_ticker = {x['ticker']: x for x in items}
    oldp = previous.get('portfolio') or {}
    old_holdings = oldp.get('holdings') or []
    exits = list(oldp.get('exitHistory') or [])
    this_month = now.strftime('%Y-%m')
    last_review = str(oldp.get('lastReviewMonth') or '')

    # Prima attivazione: fotografiamo la selezione e da qui in poi la storia non sparisce.
    if not old_holdings:
        picked = initial_pick(items)
        holdings = [{
            'ticker':x['ticker'],'name':x['name'],'entryDate':now.date().isoformat(),
            'entryPrice':x['currentPrice'],'entryCurrency':x.get('quoteCurrency'),
            'status':'ACTIVE','reason':'Selezione iniziale ETF & PAC Coach'
        } for x in picked]
        return {'holdings':holdings,'exitHistory':exits,'lastReviewMonth':this_month,'lastReviewDate':now.date().isoformat(),'reviewResult':'Portafoglio iniziale registrato','minPreferredHoldingMonths':MIN_HOLD_MONTHS}

    holdings = []
    for h in old_holdings:
        t = h.get('ticker')
        if t in by_ticker:
            holdings.append(dict(h))

    # Fuori dal cambio mese non tocchiamo la composizione: aggiorniamo solo prezzi e dati.
    if last_review == this_month:
        return {**oldp,'holdings':holdings,'exitHistory':exits,'minPreferredHoldingMonths':MIN_HOLD_MONTHS}

    changed = []
    survivors = []
    for h in holdings:
        x = by_ticker[h['ticker']]
        held_months = months_between(h.get('entryDate',''), now.date().isoformat())
        serious_break = x['monthlyRegime'] == 'RED' and x['weeklyRegime'] == 'RED'
        structural_break = x['score'] < 5.5 and x['monthlyRegime'] == 'RED'
        if serious_break or structural_break:
            exits.append({
                'ticker':h['ticker'],'name':h.get('name') or x['name'],'entryDate':h.get('entryDate'),
                'entryPrice':h.get('entryPrice'),'exitDate':now.date().isoformat(),'exitPrice':x['currentPrice'],
                'currency':x.get('quoteCurrency'),'monthsHeld':held_months,
                'reason':'Uscita confermata: deterioramento Mensile e Settimanale' if serious_break else 'Uscita: struttura di lungo periodo non più valida'
            })
            changed.append(f"Uscito {h['ticker']}")
        else:
            survivors.append(h)

    # Nessuna rotazione automatica dopo 12 mesi: i 12 mesi sono l'orizzonte minimo preferito,
    # non una scadenza. Si sostituisce solo chi ha perso davvero la tesi.
    chosen_tickers = {h['ticker'] for h in survivors}
    candidates = [x for x in initial_pick(items) if x['ticker'] not in chosen_tickers and x['status'] != 'RED']
    for x in sorted(items, key=lambda y: y['score'], reverse=True):
        if x['ticker'] not in chosen_tickers and x['status'] != 'RED' and x not in candidates:
            candidates.append(x)
    while len(survivors) < PORTFOLIO_SIZE and candidates:
        x = candidates.pop(0)
        survivors.append({'ticker':x['ticker'],'name':x['name'],'entryDate':now.date().isoformat(),'entryPrice':x['currentPrice'],'entryCurrency':x.get('quoteCurrency'),'status':'ACTIVE','reason':'Ingresso dopo uscita confermata di un ETF precedente'})
        chosen_tickers.add(x['ticker'])
        changed.append(f"Entrato {x['ticker']}")

    result = 'Nessun cambio: tesi di lungo periodo ancora valida' if not changed else ' · '.join(changed)
    return {'holdings':survivors,'exitHistory':exits[-50:],'lastReviewMonth':this_month,'lastReviewDate':now.date().isoformat(),'reviewResult':result,'minPreferredHoldingMonths':MIN_HOLD_MONTHS}


def compact_news(ticker, fallback):
    rows = []
    try:
        raw = yf.Ticker(ticker).news or []
        for n in raw[:5]:
            content = n.get('content') if isinstance(n, dict) else None
            title = (content or {}).get('title') or n.get('title')
            provider = ((content or {}).get('provider') or {}).get('displayName') or n.get('publisher')
            url = ((content or {}).get('canonicalUrl') or {}).get('url') or n.get('link')
            pub = (content or {}).get('pubDate') or n.get('providerPublishTime')
            if title:
                rows.append({'title':title,'publisher':provider,'url':url,'published':pub})
            if len(rows) >= 3:
                break
    except Exception:
        pass
    return rows or fallback or []


def main():
    previous = load_previous()
    out = []
    for t in ETFS:
        try:
            x = analyse(t)
            if x:
                out.append(x)
        except Exception as e:
            print(t[0], e)

    now = datetime.now(timezone.utc)
    portfolio = build_portfolio(out, previous, now)
    old_news = previous.get('portfolioNews') or {}
    portfolio_news = {}
    for h in portfolio.get('holdings') or []:
        ticker = h.get('ticker')
        if ticker:
            portfolio_news[ticker] = compact_news(ticker, old_news.get(ticker))

    by_ticker = {x['ticker']: x for x in out}
    for h in portfolio.get('holdings') or []:
        x = by_ticker.get(h.get('ticker'))
        if not x:
            continue
        h['currentPrice'] = x['currentPrice']
        h['currentStatus'] = x['status']
        h['monthlyRegime'] = x['monthlyRegime']
        h['weeklyRegime'] = x['weeklyRegime']
        h['heldMonths'] = months_between(h.get('entryDate',''), now.date().isoformat())
        ep = finite(h.get('entryPrice'), 0)
        h['returnSinceEntryPct'] = ((x['currentPrice'] / ep) - 1) * 100 if ep > 0 else None

    payload = {
        'generatedAt':now.isoformat(),'screenedCount':len(ETFS),'validCount':len(out),
        'strategy':{'decisionTimeframes':['1M','1W'],'dailyUsed':False,'reviewFrequency':'monthly','preferredHoldingMonths':MIN_HOLD_MONTHS,'rotationPolicy':'rare; uscita anticipata solo su deterioramento strutturale confermato 1M+1W'},
        'sourceNotes':['Prezzi e storico mensile reale: Yahoo Finance/yfinance auto-adjusted','Prezzo mostrato con valuta e mercato della quotazione usata dal motore','Universo: ETF/ETC UCITS liquidi rappresentativi su LSE/Xetra','ETF Coach: decisione strategica su Mensile + Settimanale; il Daily non entra nella logica','Revisione composizione una volta al mese; nessuna rotazione automatica se la tesi resta valida'],
        'portfolio':portfolio,'portfolioNews':portfolio_news,
        'etfs':sorted(out,key=lambda x:x['score'],reverse=True)
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':
    main()
