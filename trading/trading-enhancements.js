(() => {
  "use strict";
  const INDEX_SYMBOLS=["USATEC","GER40","US500","UK100","ESP35","FRA40","ITA40","CHINA50","BRA50"];
  const ALL_SYMBOLS=[...INDEX_SYMBOLS,"XAUUSD","XAGUSD","WTI","EURUSD","USDJPY"];

  function reorderMainMarkets(){
    const grid=document.querySelector("#marketGrid");
    if(!grid||!grid.children.length)return;
    const cards=[...grid.querySelectorAll(".market-card")];
    const bySymbol=new Map(cards.map(card=>[card.dataset.symbol,card]));
    INDEX_SYMBOLS.forEach(symbol=>{if(bySymbol.has(symbol))grid.appendChild(bySymbol.get(symbol));});
    cards.filter(card=>!INDEX_SYMBOLS.includes(card.dataset.symbol)).forEach(card=>grid.appendChild(card));
  }

  function missingConditions(root){
    const text=(root?.textContent||"").replace(/\s+/g," ");
    const match=text.match(/Manc(?:a|ano)\s+(\d+)\s+condizion/i);
    return match?Number(match[1]):null;
  }

  function metric(root,label){
    const text=(root?.textContent||"").replace(/\s+/g," ");
    const match=text.match(new RegExp(`${label}[^0-9]{0,30}(\\d+(?:[.,]\\d+)?)\\/10`,"i"));
    return match?Number(match[1].replace(",",".")):null;
  }

  function replaceText(root,from,to){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{if(from.test(node.nodeValue||""))node.nodeValue=(node.nodeValue||"").replace(from,to);});
  }

  function setYellowVisual(root){
    root.querySelectorAll(".traffic-red").forEach(el=>{
      el.classList.remove("traffic-red");
      el.classList.add("traffic-yellow");
      const symbol=el.querySelector(":scope > b, .popup-traffic-symbol");
      if(symbol)symbol.textContent="!";
    });
  }

  function shouldBeYellow(root){
    const missing=missingConditions(root);
    const trend=metric(root,"Forza trend") ?? metric(root,"Trend");
    const confluence=metric(root,"Confluenza");
    const nearReady=missing===1||missing===2;
    const strongTrendWatch=missing===3&&trend!==null&&trend>=6&&(confluence===null||confluence>=3);
    return nearReady||strongTrendWatch;
  }

  function yellowize(root){
    replaceText(root,/ROSSO\s*[·\-–—:]\s*RIMANI FUORI/gi,"GIALLO · MONITORA");
    replaceText(root,/ROSSO\s*[·\-–—:]\s*NESSUN INGRESSO/gi,"GIALLO · MONITORA");
    replaceText(root,/SEMAFORO ROSSO\s*[·\-–—:]\s*NESSUN INGRESSO/gi,"SEMAFORO GIALLO · MONITORA");
    replaceText(root,/SEMAFORO ROSSO/gi,"SEMAFORO GIALLO");
    setYellowVisual(root);
  }

  function applySemaphoreTiers(){
    document.querySelectorAll("#marketGrid .market-card").forEach(card=>{
      const yellow=shouldBeYellow(card);
      card.classList.toggle("near-ready",yellow);
      if(yellow)yellowize(card);
    });

    // La Top 3 viene renderizzata separatamente dalle schede. Applichiamo la stessa
    // regola visiva anche qui, altrimenti lo stesso asset può risultare rosso sopra
    // e giallo sotto.
    document.querySelectorAll(".ranking-table-row").forEach(row=>{
      if(shouldBeYellow(row))yellowize(row);
    });

    // Anche il pannello del primo candidato deve usare lo stesso livello del n.1.
    const lead=document.querySelector(".lead-panel");
    if(lead&&shouldBeYellow(lead))yellowize(lead);
  }

  function updateCoverage(){
    const el=document.getElementById("assetCount");
    if(!el)return;
    const analyzed=Number.parseInt((el.textContent||"").trim(),10);
    if(Number.isFinite(analyzed)){
      el.textContent=`${analyzed} / ${ALL_SYMBOLS.length}`;
      el.title=`${analyzed} asset con dati sufficienti su ${ALL_SYMBOLS.length} mercati monitorati`;
    }
  }

  function loadReadyHistory(){
    const rows=[];
    ALL_SYMBOLS.forEach(symbol=>{try{
      const entries=JSON.parse(localStorage.getItem(`marketCompassJournal:${symbol}`)||"[]");
      entries.filter(entry=>/VALUTA (UN )?(LONG|SHORT) ORA/i.test(entry.action||"")).forEach(entry=>rows.push({symbol,...entry}));
    }catch(_){}});
    return rows.sort((a,b)=>new Date(b.generatedAt)-new Date(a.generatedAt));
  }

  function renderSignalArchive(){
    const host=document.querySelector("#signalArchive");if(!host)return;
    const rows=loadReadyHistory();
    if(!rows.length){host.innerHTML=`<div class="archive-empty">Qui resteranno i segnali che sono arrivati a <strong>VERDE PIENO</strong>. Non spariranno quando cambia la classifica: potrai ricontrollarli nei giorni successivi.</div>`;return;}
    host.innerHTML=rows.slice(0,30).map(entry=>{const date=new Date(entry.generatedAt);const ageDays=Math.max(0,Math.floor((Date.now()-date.getTime())/86400000));return `<article class="archive-card"><div><strong>${entry.symbol}</strong><span class="badge ${(entry.direction||"WAIT").toLowerCase()}">${entry.direction||"WAIT"}</span></div><small>${date.toLocaleString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})} · ${ageDays===0?"oggi":`${ageDays} gg fa`}</small><p>${entry.text||entry.action||"Segnale operativo registrato"}</p><span>Prezzo al segnale: <strong>${Number(entry.current).toFixed(2)}</strong></span></article>`;}).join("");
  }

  function run(){reorderMainMarkets();applySemaphoreTiers();updateCoverage();renderSignalArchive();}
  let running=false;
  const observer=new MutationObserver(()=>{if(running)return;running=true;requestAnimationFrame(()=>{run();running=false;});});
  const main=document.querySelector("main");if(main)observer.observe(main,{childList:true,subtree:true});
  window.addEventListener("load",()=>setTimeout(run,700));
})();
