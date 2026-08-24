(() => {
  const expandedAssets = `const ASSETS = [
  { name: "Nasdaq 100", symbol: "USATEC", bias: 0.10, volatility: 1.35 },
  { name: "DAX 40", symbol: "GER40", bias: 0.04, volatility: 1.10 },
  { name: "S&P 500", symbol: "US500", bias: 0.07, volatility: 0.95 },
  { name: "FTSE 100", symbol: "UK100", bias: 0.03, volatility: 0.95 },
  { name: "IBEX 35", symbol: "ESP35", bias: 0.03, volatility: 1.05 },
  { name: "CAC 40", symbol: "FRA40", bias: 0.03, volatility: 1.00 },
  { name: "FTSE MIB", symbol: "ITA40", bias: 0.04, volatility: 1.10 },
  { name: "China A50", symbol: "CHINA50", bias: 0.02, volatility: 1.25 },
  { name: "Bovespa", symbol: "BRA50", bias: 0.03, volatility: 1.20 },
  { name: "Gold", symbol: "XAUUSD", bias: 0.05, volatility: 0.90 },
  { name: "Silver", symbol: "XAGUSD", bias: 0.02, volatility: 1.30 },
  { name: "Petrolio WTI", symbol: "WTI", bias: -0.02, volatility: 1.20 },
  { name: "EUR/USD", symbol: "EURUSD", bias: 0.01, volatility: 0.65 },
  { name: "USD/JPY", symbol: "USDJPY", bias: -0.01, volatility: 0.70 }
];`;
  const originalBlock = /const ASSETS = \[[\s\S]*?\n\];/;
  fetch(`app.js?bootstrap=${Date.now()}`, {cache:"no-store"})
    .then(r => { if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then(source => {
      if(!originalBlock.test(source)) throw new Error("Blocco ASSETS non trovato");
      (0, eval)(source.replace(originalBlock, expandedAssets));
    })
    .catch(error => {
      console.error("Errore bootstrap Trading Coach", error);
      const main=document.querySelector("main");
      if(main) main.insertAdjacentHTML("afterbegin",`<section class="notice">Errore caricamento Trading Coach: ${error.message}</section>`);
    });
})();
