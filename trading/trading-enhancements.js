(() => {
  "use strict";
  const INDEX_SYMBOLS = ["USATEC", "GER40", "US500"];
  const ALL_SYMBOLS = ["USATEC", "GER40", "US500", "XAUUSD", "XAGUSD", "WTI", "EURUSD", "USDJPY"];

  function reorderMainMarkets() {
    const grid = document.querySelector("#marketGrid");
    if (!grid || !grid.children.length) return;
    const cards = [...grid.querySelectorAll(".market-card")];
    const bySymbol = new Map(cards.map(card => [card.dataset.symbol, card]));
    INDEX_SYMBOLS.forEach(symbol => { if (bySymbol.has(symbol)) grid.appendChild(bySymbol.get(symbol)); });
    cards.filter(card => !INDEX_SYMBOLS.includes(card.dataset.symbol)).forEach(card => grid.appendChild(card));
  }

  function loadReadyHistory() {
    const rows = [];
    ALL_SYMBOLS.forEach(symbol => {
      try {
        const entries = JSON.parse(localStorage.getItem(`marketCompassJournal:${symbol}`) || "[]");
        entries.filter(entry => /VALUTA (UN )?(LONG|SHORT) ORA/i.test(entry.action || ""))
          .forEach(entry => rows.push({ symbol, ...entry }));
      } catch (_) {}
    });
    return rows.sort((a,b) => new Date(b.generatedAt) - new Date(a.generatedAt));
  }

  function renderSignalArchive() {
    const host = document.querySelector("#signalArchive");
    if (!host) return;
    const rows = loadReadyHistory();
    if (!rows.length) {
      host.innerHTML = `<div class="archive-empty">Qui resteranno i segnali che sono arrivati a <strong>VERDE PIENO</strong>. Non spariranno quando cambia la classifica: potrai ricontrollarli nei giorni successivi.</div>`;
      return;
    }
    host.innerHTML = rows.slice(0, 30).map(entry => {
      const date = new Date(entry.generatedAt);
      const ageDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
      return `<article class="archive-card">
        <div><strong>${entry.symbol}</strong><span class="badge ${(entry.direction || "WAIT").toLowerCase()}">${entry.direction || "WAIT"}</span></div>
        <small>${date.toLocaleString("it-IT", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})} · ${ageDays === 0 ? "oggi" : `${ageDays} gg fa`}</small>
        <p>${entry.text || entry.action || "Segnale operativo registrato"}</p>
        <span>Prezzo al segnale: <strong>${Number(entry.current).toFixed(2)}</strong></span>
      </article>`;
    }).join("");
  }

  function run() { reorderMainMarkets(); renderSignalArchive(); }
  let running = false;
  const observer = new MutationObserver(() => {
    if (running) return;
    running = true;
    requestAnimationFrame(() => { run(); running = false; });
  });
  const grid = document.querySelector("#marketGrid");
  if (grid) observer.observe(grid, { childList: true });
  window.addEventListener("load", () => setTimeout(run, 400));
})();
