from __future__ import annotations
import json,math
from datetime import datetime,timezone
from pathlib import Path
import numpy as np,pandas as pd,yfinance as yf
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'data'/'etf-data.json'
# Universo UCITS rappresentativo. I metadati possono essere arricchiti con justETF; prezzi/storico da Yahoo.
ETFS=[
('SWDA.L','iShares Core MSCI World UCITS ETF','Azionario globale','IE00B4L5Y983','LSE:SWDA',0.20,'Fisica','Accumulo'),
('VWCE.DE','Vanguard FTSE All-World UCITS ETF','Azionario globale','IE00BK5BQT80','XETR:VWCE',0.22,'Fisica','Accumulo'),
('CSPX.L','iShares Core S&P 500 UCITS ETF','USA','IE00B5BMR087','LSE:CSPX',0.07,'Fisica','Accumulo'),
('EQQQ.L','Invesco EQQQ NASDAQ-100 UCITS ETF','Tecnologia / Nasdaq','IE0032077012','LSE:EQQQ',0.30,'Fisica','Distribuzione'),
('EXSA.DE','iShares STOXX Europe 600 UCITS ETF','Europa','DE0002635307','XETR:EXSA',0.20,'Fisica','Distribuzione'),
('EUNA.DE','iShares Core Global Aggregate Bond UCITS ETF EUR Hedged','Obbligazionario globale','IE00BDBRDM35','XETR:EUNA',0.10,'Fisica','Accumulo'),
('SGLN.L','iShares Physical Gold ETC','Oro','IE00B4ND3602','LSE:SGLN',0.12,'Fisica','Accumulo')]
def finite(v,default=0):
 try:
  x=float(v);return x if math.isfinite(x) else default
 except:return default
def cagr(s,years):
 if len(s)<2:return None
 days=(s.index[-1]-s.index[0]).days/365.25
 if days<years*.7:return None
 return ((float(s.iloc[-1])/float(s.iloc[0]))**(1/days)-1)*100
def analyse(t):
 ticker,name,cat,isin,tv,ter,repl,dist=t
 h=yf.download(ticker,period='10y',interval='1d',auto_adjust=True,progress=False)
 if h.empty:return None
 c=h['Close'];c=c.iloc[:,0] if isinstance(c,pd.DataFrame) else c;c=c.dropna();p=float(c.iloc[-1]);peak=c.cummax();dd=((c/peak)-1)*100;draw=float(dd.min());current=float(dd.iloc[-1]);vol=float(c.pct_change().tail(252).std()*np.sqrt(252)*100)
 r1=(p/float(c.iloc[-252])-1)*100 if len(c)>=252 else None;r3=cagr(c.tail(min(len(c),756)),3);r5=cagr(c.tail(min(len(c),1260)),5);r10=cagr(c,10)
 m=c.resample('ME').last();w=c.resample('W').last();trend=5
 if len(m)>12:trend+=2 if m.iloc[-1]>m.ewm(span=10).mean().iloc[-1] else -2
 if len(w)>45:trend+=1.5 if w.iloc[-1]>w.ewm(span=40).mean().iloc[-1] else -1.5
 trend=max(0,min(10,trend));cost=max(0,min(10,10-ter*15));rob=max(0,min(10,6+(finite(r5)-5)/5-abs(draw)/35-vol/50));structure=(cost*0.55+7.5*0.45);div={'Azionario globale':9.5,'USA':7.5,'Europa':8,'Tecnologia / Nasdaq':5.5,'Obbligazionario globale':9,'Oro':6}.get(cat,7);score=structure*.35+div*.25+rob*.25+trend*.15
 status='GREEN' if score>=7.2 else 'YELLOW' if score>=5.8 else 'RED';verdict='ADATTO AL PAC' if status=='GREEN' else 'ADATTO, MA DA VALUTARE' if status=='YELLOW' else 'NON PREFERITO PER IL PAC'
 action='Continua la rata ordinaria.'
 if current<-15:action='Drawdown significativo: possibile incremento della rata solo se coerente con il piano.'
 elif current>-3 and trend>8:action='Trend molto forte e vicino ai massimi: continua il PAC, senza aumentare la rata per inseguire il prezzo.'
 return {'ticker':ticker,'name':name,'category':cat,'isin':isin,'tvSymbol':tv,'ter':ter,'replication':repl,'distribution':dist,'currentPrice':p,'return1y':r1,'return3y':r3,'return5y':r5,'return10y':r10,'drawdown':draw,'currentDrawdown':current,'volatility':vol,'trendScore':trend,'score':score,'status':status,'verdict':verdict,'pacAction':action,'summary':f'Valutazione di lungo periodo: costi {cost:.1f}/10, diversificazione {div:.1f}/10, robustezza {rob:.1f}/10 e trend {trend:.1f}/10.'}
def main():
 out=[]
 for t in ETFS:
  try:
   x=analyse(t)
   if x:out.append(x)
  except Exception as e:print(t[0],e)
 OUT.parent.mkdir(exist_ok=True);OUT.write_text(json.dumps({'generatedAt':datetime.now(timezone.utc).isoformat(),'screenedCount':len(ETFS),'sourceNotes':['Prezzi e storico: Yahoo Finance/yfinance','Dati strutturali: universo UCITS e metadati da verificare/arricchire con justETF'],'etfs':sorted(out,key=lambda x:x['score'],reverse=True)},ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()
