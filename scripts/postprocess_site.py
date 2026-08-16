from __future__ import annotations
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
import yfinance as yf
try:
    from deep_translator import GoogleTranslator
except Exception:
    GoogleTranslator = None

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'/'market-data.json'
STATE=ROOT/'data'/'investment-selection-state.json'
CACHE=ROOT/'data'/'translation-cache.json'
CAL=ROOT/'data'/'economic-calendar.json'
REVIEW_TRADING_DAYS=5

def load(path, default):
    try:return json.loads(path.read_text(encoding='utf-8'))
    except Exception:return default

def save(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')

def business_days(a,b):
    d=a;n=0
    while d<b:
        d+=timedelta(days=1)
        if d.weekday()<5:n+=1
    return n

def translate(text,cache):
    if not text:return text
    if text in cache:return cache[text]
    if GoogleTranslator is None:return text
    try:
        out=GoogleTranslator(source='auto',target='it').translate(text)
        cache[text]=out or text
        return cache[text]
    except Exception:return text

def refresh_prices(candidates):
    for c in candidates:
        try:
            h=yf.Ticker(c['ticker']).history(period='5d',interval='1d',auto_adjust=True)
            if not h.empty:c['currentPrice']=float(h['Close'].dropna().iloc[-1])
        except Exception:pass

def stabilize(root):
    inv=root.get('investment') or {}; fresh=inv.get('candidates') or []
    state=load(STATE,{})
    today=datetime.now(timezone.utc).date(); review=True
    if state.get('reviewDate') and state.get('candidates'):
        try:review=business_days(datetime.fromisoformat(state['reviewDate']).date(),today)>=REVIEW_TRADING_DAYS
        except Exception:review=True
    if review or not state.get('candidates'):
        state={'reviewDate':today.isoformat(),'candidates':fresh};save(STATE,state)
        inv['selectionReview']={'reviewedToday':True,'reviewDate':today.isoformat(),'nextReviewAfterTradingDays':REVIEW_TRADING_DAYS}
    else:
        held=state['candidates'];refresh_prices(held);inv['candidates']=held
        inv['changes']={'date':today.isoformat(),'entered':[],'exited':[],'removedReasons':[],'unchangedCount':len(held),'frozenUntilNextReview':True}
        inv['selectionReview']={'reviewedToday':False,'reviewDate':state['reviewDate'],'nextReviewAfterTradingDays':REVIEW_TRADING_DAYS-business_days(datetime.fromisoformat(state['reviewDate']).date(),today)}
    root['investment']=inv

def italianize(root):
    cache=load(CACHE,{})
    intel=root.get('intelligence') or {}
    for group in list(intel.get('market') or [])+list(intel.get('companies') or []):
        for n in group.get('news') or []:
            original=n.get('originalTitle') or n.get('title') or ''
            n['originalTitle']=original;n['title']=translate(original,cache)
            if n.get('whyItMatters'):n['whyItMatters']=translate(n['whyItMatters'],cache)
        profile=group.get('profile') or {}
        if profile.get('description'):profile['description']=translate(profile['description'],cache)
        if profile.get('industry'):profile['industry']=translate(profile['industry'],cache)
        group['profile']=profile
        if group.get('sector'):group['sector']=translate(group['sector'],cache)
    # Traduce anche le schede Investment: nome e ticker restano sempre originali.
    for c in (root.get('investment') or {}).get('candidates') or []:
        p=c.get('companyProfile') or {}
        if p.get('description'):p['description']=translate(p['description'],cache)
        if p.get('industry'):p['industry']=translate(p['industry'],cache)
        c['companyProfile']=p
        if c.get('sector'):c['sector']=translate(c['sector'],cache)
        for n in c.get('news') or []:
            original=n.get('originalTitle') or n.get('title') or ''
            n['originalTitle']=original;n['title']=translate(original,cache)
    save(CACHE,cache)

def impact(event):
    name=(event.get('title') or '').lower()
    if any(x in name for x in ['cpi','inflation','ppi','inflazione']):return 'Se il dato supera le attese può aumentare la pressione sui tassi e pesare soprattutto su Nasdaq e titoli growth; se è inferiore alle attese tende a favorire azioni e obbligazioni.'
    if any(x in name for x in ['rate','interest','fed','ecb','bce','tassi']):return 'Toni o decisioni più restrittivi del previsto tendono a penalizzare azioni growth e sostenere la valuta; indicazioni più accomodanti possono produrre l’effetto opposto.'
    if any(x in name for x in ['payroll','employment','unemployment','lavoro']):return 'Un mercato del lavoro molto forte può mantenere alti i tassi; un rallentamento moderato può favorire i mercati, mentre un deterioramento brusco aumenta il rischio recessione.'
    if any(x in name for x in ['gdp','pil']):return 'Una crescita superiore alle attese sostiene i ciclici ma può mantenere pressione sui tassi; una crescita debole penalizza i ciclici e aumenta i timori di rallentamento.'
    return 'Una sorpresa rispetto alle attese può modificare aspettative su crescita, inflazione, tassi e propensione al rischio. Conta soprattutto lo scarto fra dato effettivo e consenso.'

def economic_calendar(root):
    now=datetime.now(timezone.utc);end=now+timedelta(days=8);events=[]
    params={'from':now.strftime('%Y-%m-%dT00:00:00.000Z'),'to':end.strftime('%Y-%m-%dT23:59:59.000Z'),'countries':'US,EU,DE,IT,GB,JP'}
    try:
        r=requests.get('https://economic-calendar.tradingview.com/events',params=params,headers={'Origin':'https://www.tradingview.com','User-Agent':'Mozilla/5.0'},timeout=20);r.raise_for_status();raw=r.json();rows=raw.get('result') if isinstance(raw,dict) else raw
        for e in rows or []:
            title=e.get('title') or e.get('event') or e.get('name') or 'Evento economico'
            events.append({'title':title,'country':e.get('country') or e.get('countryCode'),'date':e.get('date') or e.get('time') or e.get('datetime'),'importance':e.get('importance') or e.get('impact'),'forecast':e.get('forecast'),'previous':e.get('previous'),'actual':e.get('actual'),'generalImpact':impact({'title':title})})
    except Exception:events=[]
    cache=load(CACHE,{})
    for e in events:e['title']=translate(e['title'],cache)
    save(CACHE,cache)
    candidates=(root.get('investment') or {}).get('candidates') or []
    assets=[{'name':a.get('name'),'symbol':a.get('symbol')} for a in root.get('assets') or []]
    save(CAL,{'generatedAt':now.isoformat(),'timezone':'Europe/Rome','events':events,'investmentCandidates':[{'name':c.get('name'),'ticker':c.get('ticker'),'sector':c.get('sector')} for c in candidates],'tradingAssets':assets})

def main():
    root=load(DATA,{})
    if not root:return 1
    stabilize(root);italianize(root);economic_calendar(root);save(DATA,root);return 0
if __name__=='__main__':raise SystemExit(main())
