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
  const rankingBlock = /const ranking = \[\.\.\.analyses\][\s\S]*?\.slice\(0, 3\);/;
  const rankingReplacement = `const ranking = [...analyses]
    .sort((a, b) => {
      // Prima viene la reale operatività: VERDE > GIALLO > ROSSO.
      // Solo dentro lo stesso colore ordiniamo per qualità tecnica.
      const statusOrder = { GREEN: 3, YELLOW: 2, RED: 1 };
      const statusDifference =
        statusOrder[operationalStatus(b).code] -
        statusOrder[operationalStatus(a).code];
      if (statusDifference !== 0) return statusDifference;

      const finalDifference = finalSetupScore(b) - finalSetupScore(a);
      if (Math.abs(finalDifference) >= 0.05) return finalDifference;

      const trendDifference = tenScale(b.result.confidence) - tenScale(a.result.confidence);
      if (trendDifference !== 0) return trendDifference;

      const confluenceDifference =
        (b.structure?.confluenceScore || 0) - (a.structure?.confluenceScore || 0);
      if (confluenceDifference !== 0) return confluenceDifference;

      return tenScale(b.plan.opportunityScore) - tenScale(a.plan.opportunityScore);
    })
    .slice(0, 3);`;

  fetch(`app.js?bootstrap=${Date.now()}`, {cache:"no-store"})
    .then(r => { if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then(source => {
      if(!originalBlock.test(source)) throw new Error("Blocco ASSETS non trovato");
      let patched = source.replace(originalBlock, expandedAssets);
      if(!rankingBlock.test(patched)) throw new Error("Blocco classifica Trading non trovato");
      patched = patched.replace(rankingBlock, rankingReplacement);
      (0, eval)(patched);
    })
    .catch(error => {
      console.error("Errore bootstrap Trading Coach", error);
      const main=document.querySelector("main");
      if(main) main.insertAdjacentHTML("afterbegin",`<section class="notice">Errore caricamento Trading Coach: ${error.message}</section>`);
    });
})();
