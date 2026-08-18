from __future__ import annotations
import json,math
from datetime import datetime,timezone
from pathlib import Path
import numpy as np,pandas as pd,yfinance as yf
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'data'/'etf-data.json'
# Universo UCITS liquido e rappresentativo, quotato su LSE/Xetra. Il motore sceglie per ruolo e punteggio, non solo per performance.
ETFS=[
('SWDA.L','iShares Core MSCI World UCITS ETF','Azionario globale','IE00B4L5Y983','LSE:SWDA',0.20,'Fisica','Accumulo'),('VWCE.DE','Vanguard FTSE All-World UCITS ETF','Azionario globale','IE00BK5BQT80','XETR:VWCE',0.22,'Fisica','Accumulo'),('VWRL.L','Vanguard FTSE All-World UCITS ETF Dist','Azionario globale','IE00B3RBWM25','LSE:VWRL',0.22,'Fisica','Distribuzione'),('SSAC.L','iShares MSCI ACWI UCITS ETF','Azionario globale','IE00B6R52259','LSE:SSAC',0.20,'Fisica','Accumulo'),
('CSPX.L','iShares Core S&P 500 UCITS ETF','USA','IE00B5BMR087','LSE:CSPX',0.07,'Fisica','Accumulo'),('VUAA.L','Vanguard S&P 500 UCITS ETF','USA','IE00BFMXXD54','LSE:VUAA',0.07,'Fisica','Accumulo'),('IUSA.L','iShares Core S&P 500 UCITS ETF Dist','USA','IE0031442068','LSE:IUSA',0.07,'Fisica','Distribuzione'),
('EQQQ.L','Invesco EQQQ NASDAQ-100 UCITS ETF','Tecnologia / Nasdaq','IE0032077012','LSE:EQQQ',0.30,'Fisica','Distribuzione'),('CNDX.L','iShares NASDAQ 100 UCITS ETF','Tecnologia / Nasdaq','IE00B53SZB19','LSE:CNDX',0.33,'Fisica','Accumulo'),
('EXSA.DE','iShares STOXX Europe 600 UCITS ETF','Europa','DE0002635307','XETR:EXSA',0.20,'Fisica','Distribuzione'),('MEUD.L','Amundi STOXX Europe 600 UCITS ETF','Europa','LU0908500753','LSE:MEUD',0.07,'Fisica','Accumulo'),
('EIMI.L','iShares Core MSCI Emerging Markets IMI UCITS ETF','Emergenti','IE00BKM4GZ66','LSE:EIMI',0.18,'Fisica','Accumulo'),('VFEM.L','Vanguard FTSE Emerging Markets UCITS ETF','Emergenti','IE00B3VVMM84','LSE:VFEM',0.22,'Fisica','Distribuzione'),
('EUNA.DE','iShares Core Global Aggregate Bond UCITS ETF EUR Hedged','Obbligazionario globale','IE00BDBRDM35','XETR:EUNA',0.10,'Fisica','Accumulo'),('AGGH.L','iShares Core Global Aggregate Bond UCITS ETF','Obbligazionario globale','IE00BDBRDM35','LSE:AGGH',0.10,'Fisica','Accumulo'),
('SGLN.L','iShares Physical Gold ETC','Oro','IE00B4ND3602','LSE:SGLN',0.12,'Fisica','Accumulo'),('PHAU.L','WisdomTree Physical Gold','Oro','JE00B1VS3770','LSE:PHAU',0.39,'Fisica','Accumulo'),
('INRG.L','iShares Global Clean Energy Transition UCITS ETF','Tematico','IE00B1XNHC34','LSE:INRG',0.65,'Fisica','Distribuzione'),('RBOT.L','iShares Automation & Robotics UCITS ETF','Tematico','IE00BYZK4552','LSE:RBOT',0.40,'Fisica','Accumulo'),('IUIT.L','iShares S&P 500 Information Technology Sector UCITS ETF','Tecnologia','IE00B3WJKG14','LSE:IUIT',0.15,'Fisica','Accumulo'),
('MVOL.L','iShares Edge MSCI World Minimum Volatility UCITS ETF','Fattoriale difensivo','IE00B8FHGS14','LSE:MVOL',0.30,'Fisica','Accumulo'),('IWQU.L','iShares Edge MSCI World Quality Factor UCITS ETF','Fattoriale qualità','IE00BP3QZ601','LSE:IWQU',0.30,'Fisica','Accumulo')]
DIV={'Azionario globale':9.7,'USA':7.3,'Europa':8.2,'Tecnologia / Nasdaq':5.5,'Tecnologia':5.2,'Emergenti':7.2,'Obbligazionario globale':9.0,'Oro':6.5,'Tematico':4.5,'Fattoriale difensivo':8.0,'Fattoriale qualità':8.0}
def finite(v,d=0):
 try:x=float(v);return x if math.isfinite(x) else d
 except:return d
def cagr(s,years):
 if len(s)<2:return None
 days=(s.index[-1]-s.index[0]).days/365.25
 if days<years*.7:return None
 return ((float(s.iloc[-1])/float(s.iloc[0]))**(1/days)-1)*100
def quote_meta(ticker,tv):
 currency=None
 try:
  fi=yf.Ticker(ticker).fast_info
  currency=fi.get('currency') if hasattr(fi,'get') else getattr(fi,'currency',None)
 except Exception: pass
 exchange='Xetra' if tv.startswith('XETR:') else 'London Stock Exchange' if tv.startswith('LSE:') else tv.split(':')[0]
 return currency,exchange
def analyse(t):
 ticker,name,cat,isin,tv,ter,repl,dist=t;h=yf.download(ticker,period='10y',interval='1d',auto_adjust=True,progress=False)
 if h.empty:return None
 c=h['Close'];c=c.iloc[:,0] if isinstance(c,pd.DataFrame) else c;c=c.dropna()
 if len(c)<120:return None
 p=float(c.iloc[-1]);dd=(c/c.cummax()-1)*100;draw=float(dd.min());current=float(dd.iloc[-1]);vol=float(c.pct_change().tail(252).std()*np.sqrt(252)*100)
 r1=(p/float(c.iloc[-252])-1)*100 if len(c)>=252 else None;r3=cagr(c.tail(min(len(c),756)),3);r5=cagr(c.tail(min(len(c),1260)),5);r10=cagr(c,10)
 m=c.resample('MS').first().dropna();monthly=[{'date':idx.strftime('%Y-%m-%d'),'price':round(float(v),6)} for idx,v in m.items()];w=c.resample('W').last();trend=5
 if len(m)>12:trend+=2 if m.iloc[-1]>m.ewm(span=10).mean().iloc[-1] else -2
 if len(w)>45:trend+=1.5 if w.iloc[-1]>w.ewm(span=40).mean().iloc[-1] else -1.5
 trend=max(0,min(10,trend));cost=max(0,min(10,10-ter*15));rob=max(0,min(10,6+(finite(r5)-5)/5-abs(draw)/38-vol/55));structure=cost*.6+7.8*.4;div=DIV.get(cat,7);score=structure*.35+div*.25+rob*.25+trend*.15
 status='GREEN' if score>=7.2 else 'YELLOW' if score>=5.8 else 'RED';verdict='ADATTO AL PAC' if status=='GREEN' else 'ADATTO, MA DA VALUTARE' if status=='YELLOW' else 'NON PREFERITO PER IL PAC';action='Continua la rata ordinaria.'
 if current<-15:action='Drawdown significativo: valuta un incremento solo se coerente con il piano e il rischio.'
 elif current>-3 and trend>8:action='Vicino ai massimi: continua il PAC senza aumentare la rata per inseguire il prezzo.'
 currency,exchange=quote_meta(ticker,tv)
 return {'ticker':ticker,'name':name,'category':cat,'isin':isin,'tvSymbol':tv,'exchange':exchange,'quoteCurrency':currency,'ter':ter,'replication':repl,'distribution':dist,'currentPrice':p,'return1y':r1,'return3y':r3,'return5y':r5,'return10y':r10,'drawdown':draw,'currentDrawdown':current,'volatility':vol,'trendScore':trend,'score':score,'status':status,'verdict':verdict,'pacAction':action,'monthlyHistory':monthly,'historyStart':monthly[0]['date'] if monthly else None,'summary':f'Costi {cost:.1f}/10 · diversificazione {div:.1f}/10 · robustezza {rob:.1f}/10 · trend {trend:.1f}/10.'}
def main():
 out=[]
 for t in ETFS:
  try:
   x=analyse(t)
   if x:out.append(x)
  except Exception as e:print(t[0],e)
 generated=datetime.now(timezone.utc).isoformat()
 OUT.parent.mkdir(exist_ok=True);OUT.write_text(json.dumps({'generatedAt':generated,'screenedCount':len(ETFS),'validCount':len(out),'sourceNotes':['Prezzi e storico mensile reale: Yahoo Finance/yfinance auto-adjusted','Prezzo mostrato con valuta e mercato della quotazione usata dal motore','Universo: ETF/ETC UCITS liquidi rappresentativi su LSE/Xetra','Selezione portafoglio: ruoli diversi, costi, diversificazione, robustezza e trend; non semplice classifica rendimento'],'etfs':sorted(out,key=lambda x:x['score'],reverse=True)},ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()
