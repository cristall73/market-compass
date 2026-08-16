(() => {
  "use strict";

  const avg=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
  const emaSeries=(v,p)=>{if(!v?.length||v.length<p)return[];const m=2/(p+1),o=[];let x=avg(v.slice(0,p));for(let i=0;i<p-1;i++)o.push(null);o.push(x);for(let i=p;i<v.length;i++){x=(v[i]-x)*m+x;o.push(x)}return o};
  const ema=(v,p)=>{const s=emaSeries(v,p);return s.length?s.at(-1):null};
  const atr=(c,p=14)=>{if(!c?.length||c.length<p+1)return null;const tr=c.map((x,i)=>!i?x.high-x.low:Math.max(x.high-x.low,Math.abs(x.high-c[i-1].close),Math.abs(x.low-c[i-1].close)));return avg(tr.slice(-p))};
  const rsi=(v,p=14)=>{if(!v?.length||v.length<p+1)return null;let g=0,l=0;for(let i=v.length-p;i<v.length;i++){const d=v[i]-v[i-1];d>=0?g+=d:l+=Math.abs(d)}if(l===0)return 100;const rs=(g/p)/(l/p);return 100-(100/(1+rs))};
  const stochastic=(c,p=14)=>{if(!c?.length||c.length<p)return null;const w=c.slice(-p),h=Math.max(...w.map(x=>x.high)),l=Math.min(...w.map(x=>x.low)),cl=c.at(-1).close;return h===l?50:(cl-l)/(h-l)*100};
  const nadarayaWatson=(v,b=8)=>{if(!v?.length||v.length<3)return null;const t=v.length-1;let n=0,d=0;v.forEach((x,i)=>{const z=(t-i)/b,w=Math.exp(-.5*z*z);n+=w*x;d+=w});return d?n/d:null};
  const recentSwing=(c,n=20)=>{const w=(c||[]).slice(-n);if(w.length<3)return null;const low=Math.min(...w.map(x=>x.low)),high=Math.max(...w.map(x=>x.high));return{low,high,midpoint:low+(high-low)*.5}};

  function pivots(candles,lookback=80){
    const c=(candles||[]).slice(-lookback),out=[];
    for(let i=2;i<c.length-2;i++){
      if(c[i].high>c[i-1].high&&c[i].high>c[i-2].high&&c[i].high>=c[i+1].high&&c[i].high>=c[i+2].high)out.push({type:"H",value:c[i].high,i});
      if(c[i].low<c[i-1].low&&c[i].low<c[i-2].low&&c[i].low<=c[i+1].low&&c[i].low<=c[i+2].low)out.push({type:"L",value:c[i].low,i});
    }
    return out;
  }

  function dowStructure(c){
    const p=pivots(c,100),h=p.filter(x=>x.type==="H").slice(-3),l=p.filter(x=>x.type==="L").slice(-3);
    if(h.length>=2&&l.length>=2){
      const hh=h.at(-1).value>h.at(-2).value,ll=l.at(-1).value>l.at(-2).value;
      const lh=h.at(-1).value<h.at(-2).value,low=l.at(-1).value<l.at(-2).value;
      if(hh&&ll)return{direction:"LONG",score:1,label:"Dow: massimi e minimi crescenti"};
      if(lh&&low)return{direction:"SHORT",score:-1,label:"Dow: massimi e minimi decrescenti"};
    }
    return{direction:"WAIT",score:0,label:"Dow: struttura non confermata"};
  }

  function candlestickPatterns(c){
    if(!c?.length||c.length<3)return[];const x=c.at(-1),p=c.at(-2),range=Math.max(.000001,x.high-x.low),body=Math.abs(x.close-x.open),upper=x.high-Math.max(x.open,x.close),lower=Math.min(x.open,x.close)-x.low;const out=[];
    if(body/range<=.25&&upper/range>=.55)out.push({name:"Shooting star",bias:-1});
    if(body/range<=.35&&lower/range>=.55)out.push({name:"Hammer",bias:1});
    if(body/range<=.18&&upper/range>.25&&lower/range>.25)out.push({name:"Spinning top",bias:0});
    if(x.close>x.open&&p.close<p.open&&x.open<=p.close&&x.close>=p.open)out.push({name:"Bullish engulfing",bias:1});
    if(x.close<x.open&&p.close>p.open&&x.open>=p.close&&x.close<=p.open)out.push({name:"Bearish engulfing",bias:-1});
    return out;
  }

  function classicalPatterns(c){
    const p=pivots(c,120),h=p.filter(x=>x.type==="H"),l=p.filter(x=>x.type==="L"),out=[];
    const close=(a,b,t=.018)=>Math.abs(a-b)/((a+b)/2)<=t;
    if(h.length>=2&&close(h.at(-1).value,h.at(-2).value))out.push({name:"Doppio massimo",bias:-1});
    if(l.length>=2&&close(l.at(-1).value,l.at(-2).value))out.push({name:"Doppio minimo",bias:1});
    if(h.length>=3){const a=h.slice(-3);if(a[1].value>a[0].value&&a[1].value>a[2].value&&close(a[0].value,a[2].value,.03))out.push({name:"Testa e spalle",bias:-1})}
    if(l.length>=3){const a=l.slice(-3);if(a[1].value<a[0].value&&a[1].value<a[2].value&&close(a[0].value,a[2].value,.03))out.push({name:"Testa e spalle inverso",bias:1})}
    const w=(c||[]).slice(-40);if(w.length>=20){const first=w.slice(0,20),last=w.slice(-10),hi1=Math.max(...first.map(x=>x.high)),lo1=Math.min(...first.map(x=>x.low)),hi2=Math.max(...last.map(x=>x.high)),lo2=Math.min(...last.map(x=>x.low));if((hi2-lo2)<(hi1-lo1)*.55)out.push({name:"Triangolo / compressione",bias:0});const move=(w[20]?.close-w[0].close)/(w[0].close||1);if(Math.abs(move)>.05&&(hi2-lo2)<Math.abs(w[20].close-w[0].close)*.45)out.push({name:move>0?"Bandiera rialzista":"Bandiera ribassista",bias:move>0?1:-1})}
    return out;
  }

  function trendScore(c){
    const v=c.map(x=>x.close),cur=v.at(-1),m5=ema(v,5),m10=ema(v,10),m50=ema(v,50),m60=ema(v,60),m200=ema(v,200);let s=0;
    [[m5,1],[m10,1],[m50,1],[m60,1],[m200,2]].forEach(([m,w])=>{if(m!=null)s+=cur>m?w:-w});if(m5!=null&&m10!=null)s+=m5>m10?1:-1;if(m50!=null&&m200!=null)s+=m50>m200?2:-2;
    return{score:Math.max(-1,Math.min(1,s/10)),averages:{ma5:m5,ma10:m10,ma50:m50,ma60:m60,ma200:m200}};
  }

  function analyzeTimeframe(c,config){
    if(!Array.isArray(c)||c.length<20)return{valid:false,score:0,reasons:["Dati insufficienti"]};
    const closes=c.map(x=>x.close),current=closes.at(-1),trend=trendScore(c),a=atr(c,config.indicators.atrPeriod),r=rsi(closes,config.indicators.rsiPeriod),st=stochastic(c,config.indicators.stochasticPeriod),nw=nadarayaWatson(closes,config.indicators.nadarayaBandwidth),swing=recentSwing(c),dow=dowStructure(c),candles=candlestickPatterns(c),charts=classicalPatterns(c);
    let momentum=0;if(r!=null){if(r>=55&&r<=72)momentum+=.6;else if(r<=45&&r>=28)momentum-=.6;else if(r>78)momentum-=.25;else if(r<22)momentum+=.25}if(st!=null){if(st>55&&st<85)momentum+=.4;else if(st<45&&st>15)momentum-=.4}momentum=Math.max(-1,Math.min(1,momentum));
    let retr=0,dist=null;if(swing&&a){dist=Math.abs(current-swing.midpoint);if(dist<=a*config.entry.toleranceAtr)retr=trend.score>=0?1:-1}
    const candleBias=candles.reduce((z,x)=>z+x.bias,0),chartBias=charts.reduce((z,x)=>z+x.bias,0);const patternScore=Math.max(-1,Math.min(1,(candleBias*.45+chartBias*.35+dow.score*.7)));
    const raw=trend.score*.30+momentum*.16+(nw==null?0:current>nw?1:-1)*.12+patternScore*.22+retr*.20;
    const reasons=[trend.score>.25?"Trend rialzista":trend.score<-.25?"Trend ribassista":"Trend neutrale",dow.label];if(nw!=null)reasons.push(current>nw?"Prezzo sopra Nadaraya":"Prezzo sotto Nadaraya");if(retr)reasons.push("Ritracciamento vicino al 50%");candles.forEach(x=>reasons.push(x.name));charts.forEach(x=>reasons.push(x.name));
    return{valid:true,score:Math.round(raw*100),current,atr:a,rsi:r,stochastic:st,nadaraya:nw,swing,retracementDistance:dist,movingAverages:trend.averages,patterns:[...candles,...charts].map(x=>x.name),candlestickPatterns:candles,dow,chartPatterns:charts,reasons};
  }

  const dir=s=>s>=25?"LONG":s<=-25?"SHORT":"WAIT";
  function analyzeMarket(tf,custom={}){
    const base=window.TRADING_CONFIG,config={...base,...custom,indicators:{...base.indicators,...(custom.indicators||{})},entry:{...base.entry,...(custom.entry||{})}};const details={};let ws=0,tw=0;
    config.timeframes.forEach(t=>{const r=analyzeTimeframe(tf[t],config);details[t]=r;if(r.valid){const w=config.weights.timeframeTrend[t]||0;ws+=r.score*w;tw+=w}});const score=tw?Math.round(ws/tw):0;
    const d={};config.timeframes.forEach(t=>d[t]=dir(details[t]?.score||0));
    const longTermLong=[d["1M"],d["1W"]].every(x=>x!=="SHORT")&&(d["1M"]==="LONG"||d["1W"]==="LONG");
    const longTermShort=[d["1M"],d["1W"]].every(x=>x!=="LONG")&&(d["1M"]==="SHORT"||d["1W"]==="SHORT");
    const fastLong=d["1D"]==="LONG"&&d["4H"]==="LONG"&&d["1H"]==="LONG";
    const fastShort=d["1D"]==="SHORT"&&d["4H"]==="SHORT"&&d["1H"]==="SHORT";
    let direction="WAIT";if(longTermLong&&fastLong&&score>=20)direction="LONG";else if(longTermShort&&fastShort&&score<=-20)direction="SHORT";
    const vals=Object.values(d),lc=vals.filter(x=>x==="LONG").length,sc=vals.filter(x=>x==="SHORT").length,wc=vals.filter(x=>x==="WAIT").length,alignment=Math.round(Math.max(lc,sc,wc)/config.timeframes.length*100),confidence=Math.min(100,Math.round(Math.abs(score)*.72+alignment*.28));
    return{direction,score,confidence,alignment,consensus:{long:lc,short:sc,wait:wc},details,timeframeDirections:d,fastTradeReady:direction!=="WAIT",rules:{entryRetracement:"50%",timeframes:config.timeframes,movingAverages:config.movingAverages,logic:"1M/1W trend di fondo; 1D/4H/1H devono essere allineati per un ingresso veloce"}};
  }

  window.TradingEngine={analyzeMarket,analyzeTimeframe,indicators:{ema,atr,rsi,stochastic,nadarayaWatson},patterns:{candlestickPatterns,classicalPatterns,dowStructure}};
})();
