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
    nodes.forEach(node=>{if(from.test(node.nodeValue||""))node.nodeValue=(node.nodeValue||"").replace(from,to);from.lastIndex=0;});
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

  function timeframeDirection(text,tf){
    const match=(text||"").match(new RegExp(`(?:^|\\s)${tf}\\s+(LONG|SHORT|WAIT)(?:\\s|$)`,"i"));
    return match?match[1].toUpperCase():null;
  }

  function inferBiasFromCard(card){
    if(!card)return null;
    const text=(card.textContent||"").replace(/\s+/g," ");
    const high=["1M","1W","1D"].map(tf=>timeframeDirection(text,tf)).filter(Boolean);
    const longs=high.filter(x=>x==="LONG").length;
    const shorts=high.filter(x=>x==="SHORT").length;
    if(longs>=2)return "LONG";
    if(shorts>=2)return "SHORT";
    const d4=timeframeDirection(text,"4H");
    if(d4&&d4!=="WAIT")return d4;
    const h1=timeframeDirection(text,"1H");
    return h1&&h1!=="WAIT"?h1:null;
  }

  function assetKey(root){
    if(!root)return "";
    if(root.dataset?.symbol)return root.dataset.symbol.toUpperCase();
    const text=(root.textContent||"").toUpperCase();
    const aliases={"NASDAQ 100":"USATEC","DAX 40":"GER40","S&P 500":"US500","FTSE 100":"UK100","IBEX 35":"ESP35","CAC 40":"FRA40","FTSE MIB":"ITA40","CHINA A50":"CHINA50","BOVESPA":"BRA50","GOLD":"XAUUSD","SILVER":"XAGUSD","PETROLIO WTI":"WTI","EUR/USD":"EURUSD","USD/JPY":"USDJPY"};
    for(const [name,symbol] of Object.entries(aliases))if(text.includes(name))return symbol;
    return "";
  }

  function buildBiasMap(){
    const map=new Map();
    document.querySelectorAll("#marketGrid .market-card").forEach(card=>{
      const key=assetKey(card),bias=inferBiasFromCard(card);
      if(key&&bias)map.set(key,bias);
    });
    return map;
  }

  function biasForRoot(root,biasMap){
    const direct=inferBiasFromCard(root);
    if(direct)return direct;
    const key=assetKey(root);
    return key?biasMap.get(key)||null:null;
  }

  function forceYellowLabels(root,bias){
    const suffix=bias?` ${bias}`:"";
    root.querySelectorAll(".traffic-status").forEach(el=>{
      el.classList.remove("traffic-red");
      el.classList.add("traffic-yellow");
      const icon=el.querySelector("b");
      const label=el.querySelector("span");
      if(icon)icon.textContent="!";
      if(label)label.textContent=`GIALLO · MONITORA${suffix}`;
    });

    root.querySelectorAll(".lead-traffic").forEach(el=>{
      el.classList.remove("traffic-red");
      el.classList.add("traffic-yellow");
      const icon=el.querySelector(":scope > b");
      const color=el.querySelector("div > small");
      const action=el.querySelector("div > strong");
      const label=el.querySelector("div > span");
      if(icon)icon.textContent="!";
      if(color)color.textContent="GIALLO";
      if(action)action.textContent=`MONITORA${suffix}`;
      if(label)label.textContent=bias?`BIAS ${bias} · ATTENDI IL TIMING SUL RITRACCIAMENTO`:"SEMAFORO GIALLO · SETUP DA MONITORARE";
    });

    root.querySelectorAll(".badge.wait, .direction.wait, .direction-badge.wait").forEach(el=>{
      if(bias)el.textContent=`WAIT · BIAS ${bias}`;
    });
  }

  function yellowize(root,bias){
    const replacement=bias?`GIALLO · MONITORA ${bias}`:"GIALLO · MONITORA";
    replaceText(root,/GIALLO\s*[·\-–—:]\s*MONITORA(?:\s+(?:LONG|SHORT))?/gi,replacement);
    replaceText(root,/ROSSO\s*[·\-–—:]\s*RIMANI FUORI/gi,replacement);
    replaceText(root,/ROSSO\s*[·\-–—:]\s*NESSUN INGRESSO/gi,replacement);
    replaceText(root,/SEMAFORO ROSSO\s*[·\-–—:]\s*NESSUN INGRESSO/gi,bias?`BIAS ${bias} · ATTENDI IL TIMING`:"SEMAFORO GIALLO · MONITORA");
    replaceText(root,/SEMAFORO ROSSO/gi,"SEMAFORO GIALLO");
    setYellowVisual(root);
    forceYellowLabels(root,bias);
  }

  function applySemaphoreTiers(){
    const biasMap=buildBiasMap();
    document.querySelectorAll("#marketGrid .market-card").forEach(card=>{
      const yellow=shouldBeYellow(card);
      card.classList.toggle("near-ready",yellow);
      if(yellow)yellowize(card,biasForRoot(card,biasMap));
    });

    document.querySelectorAll(".ranking-table-row").forEach(row=>{
      if(shouldBeYellow(row))yellowize(row,biasForRoot(row,biasMap));
    });

    const lead=document.querySelector(".lead-panel");
    if(lead&&shouldBeYellow(lead))yellowize(lead,biasForRoot(lead,biasMap));
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
