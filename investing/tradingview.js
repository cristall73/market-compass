const TV_EXCHANGE_MAP={
  MU:'NASDAQ:MU',AVGO:'NASDAQ:AVGO',ECL:'NYSE:ECL',GOOGL:'NASDAQ:GOOGL',BP:'NYSE:BP','BP.L':'LSE:BP.',
  AAPL:'NASDAQ:AAPL',MSFT:'NASDAQ:MSFT',NVDA:'NASDAQ:NVDA',AMZN:'NASDAQ:AMZN',META:'NASDAQ:META',TSLA:'NASDAQ:TSLA',
  AMD:'NASDAQ:AMD',QCOM:'NASDAQ:QCOM',PLTR:'NASDAQ:PLTR',NFLX:'NASDAQ:NFLX',ADBE:'NASDAQ:ADBE',PANW:'NASDAQ:PANW',
  JPM:'NYSE:JPM',V:'NYSE:V',MA:'NYSE:MA',XOM:'NYSE:XOM',CVX:'NYSE:CVX',IBM:'NYSE:IBM',GE:'NYSE:GE',CAT:'NYSE:CAT',
  ASML:'NASDAQ:ASML',SAP:'NYSE:SAP',NVO:'NYSE:NVO',AZN:'NASDAQ:AZN',SHEL:'NYSE:SHEL',HSBC:'NYSE:HSBC',RIO:'NYSE:RIO'
};
function tvSymbol(ticker){
  if(TV_EXCHANGE_MAP[ticker])return TV_EXCHANGE_MAP[ticker];
  if(ticker.endsWith('.DE'))return `XETR:${ticker.replace('.DE','')}`;
  if(ticker.endsWith('.PA'))return `EURONEXT:${ticker.replace('.PA','')}`;
  if(ticker.endsWith('.MI'))return `MIL:${ticker.replace('.MI','')}`;
  if(ticker.endsWith('.AS'))return `EURONEXT:${ticker.replace('.AS','')}`;
  if(ticker.endsWith('.MC'))return `BME:${ticker.replace('.MC','')}`;
  if(ticker.endsWith('.SW'))return `SIX:${ticker.replace('.SW','')}`;
  if(ticker.endsWith('.L'))return `LSE:${ticker.replace('.L','')}`;
  if(ticker.endsWith('.T'))return `TSE:${ticker.replace('.T','')}`;
  if(ticker.endsWith('.TO'))return `TSX:${ticker.replace('.TO','')}`;
  if(ticker.endsWith('.AX'))return `ASX:${ticker.replace('.AX','')}`;
  if(ticker.endsWith('.CO'))return `OMXCOP:${ticker.replace('.CO','')}`;
  if(ticker.endsWith('.ST'))return `OMXSTO:${ticker.replace('.ST','')}`;
  if(ticker.endsWith('.HE'))return `OMXHEX:${ticker.replace('.HE','')}`;
  return ticker;
}
function mountInvestmentTradingView(items){
  const root=document.getElementById('investmentTradingView');if(!root)return;
  const top=(items||[]).slice(0,5);
  root.innerHTML=top.map((item,i)=>`<article class="tv-invest-card"><div class="tv-invest-head"><div><strong>${item.name}</strong><small>${item.ticker} · Daily</small></div><a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol(item.ticker))}" target="_blank" rel="noopener">Apri grafico ↗</a></div><div id="tv-invest-${i}" class="tv-invest-widget"></div></article>`).join('');
  top.forEach((item,i)=>{
    const host=document.getElementById(`tv-invest-${i}`);if(!host)return;
    const s=document.createElement('script');s.type='text/javascript';s.async=true;s.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    s.innerHTML=JSON.stringify({autosize:true,symbol:tvSymbol(item.ticker),interval:'D',timezone:'Europe/Rome',theme:'dark',style:'1',locale:'it',allow_symbol_change:true,calendar:false,hide_side_toolbar:true,withdateranges:true,details:false,hotlist:false,studies:[],support_host:'https://www.tradingview.com'});
    host.appendChild(s);
  });
}
async function loadInvestmentTradingView(){
  try{
    const r=await fetch(`../data/market-data.json?tv=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);
    const d=await r.json();mountInvestmentTradingView((d.investment||{}).candidates||[]);
  }catch(e){const root=document.getElementById('investmentTradingView');if(root)root.innerHTML='<p class="tv-invest-error">Anteprime TradingView temporaneamente non disponibili.</p>'}
}
loadInvestmentTradingView();
