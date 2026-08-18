const DATA='../data/etf-data.json';
const $=s=>document.querySelector(s);
const f=(v,d=1)=>Number.isFinite(Number(v))?Number(v).toLocaleString('it-IT',{maximumFractionDigits:d}):'—';
const euro=v=>Number(v).toLocaleString('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0});
let DATASET=[];

function role(i){
  const c=(i.category||'').toLowerCase(),n=(i.name||'').toLowerCase();
  if(c.includes('globale')&&!c.includes('obbl'))return'CORE GLOBALE';
  if(c.includes('usa'))return'CRESCITA USA';
  if(c.includes('europa'))return'DIVERSIFICAZIONE EUROPA';
  if(c.includes('tecnologia')||c.includes('nasdaq')||n.includes('nasdaq'))return'CRESCITA / TECNOLOGIA';
  if(c.includes('oro')||n.includes('gold'))return'DIFESA / ORO';
  if(c.includes('obbl'))return'STABILIZZATORE';
  return'DIVERSIFICAZIONE';
}
function why(i){
  const r=role(i);
  if(r==='CORE GLOBALE')return'È il cuore del PAC: offre esposizione ampia a molte aziende e paesi in un solo strumento.';
  if(r==='CRESCITA USA')return'Rafforza l’esposizione alle grandi società statunitensi e il potenziale di crescita.';
  if(r==='DIVERSIFICAZIONE EUROPA')return'Aggiunge peso all’Europa e riduce la dipendenza esclusiva dal mercato statunitense.';
  if(r==='CRESCITA / TECNOLOGIA')return'Aumenta il potenziale di crescita. La sovrapposizione con il core è accettata consapevolmente ma viene segnalata.';
  if(r==='DIFESA / ORO')return'L’oro resta nel PAC come vera componente di diversificazione rispetto alle azioni.';
  if(r==='STABILIZZATORE')return'La componente obbligazionaria entra solo se competitiva: non ha più un posto garantito.';
  return'Completa il portafoglio con un’esposizione differente.';
}
function growthScore(i){
  const r1=Number(i.return1y)||0,r3=Number(i.return3y)||0,r5=Number(i.return5y)||0,r10=Number(i.return10y)||0,quality=(Number(i.score)||0)*10;
  return r1*.15+r3*.30+r5*.30+r10*.15+quality*.10;
}
function pick5(a){
  const ranked=[...a].sort((x,y)=>growthScore(y)-growthScore(x));
  const chosen=[]; const add=x=>{if(x&&!chosen.includes(x)&&chosen.length<5)chosen.push(x)};
  add(ranked.find(x=>role(x)==='CORE GLOBALE'));
  add(ranked.find(x=>role(x)==='DIVERSIFICAZIONE EUROPA'));
  add(ranked.find(x=>role(x)==='DIFESA / ORO'));
  ranked.filter(x=>!chosen.includes(x)&&role(x)!=='STABILIZZATORE').forEach(add);
  ranked.forEach(add);
  return chosen.slice(0,5);
}
function chart(i){
  const hist=(i.monthlyHistory||[]).filter(x=>Number(x.price)>0).slice(-60);
  if(hist.length<2)return '<div class="price-chart empty">Storico grafico non disponibile</div>';
  const values=hist.map(x=>Number(x.price)),min=Math.min(...values),max=Math.max(...values),range=Math.max(1,max-min),w=700,h=220,p=18;
  const pts=values.map((v,n)=>`${(p+n*(w-2*p)/(values.length-1)).toFixed(1)},${(h-p-(v-min)*(h-2*p)/range).toFixed(1)}`).join(' ');
  const perf=(values[values.length-1]/values[0]-1)*100;
  return `<div class="price-chart"><div class="chart-head"><span>Storico mensile reale · ultimi ${hist.length} mesi disponibili</span><strong>${perf>=0?'+':''}${f(perf)}%</strong></div><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" class="chart-line"/></svg><div class="chart-foot"><span>${hist[0].date.slice(0,7)}</span><span>Min ${f(min,2)} · Max ${f(max,2)}</span><span>${hist[hist.length-1].date.slice(0,7)}</span></div></div>`;
}
function card(i,budget,count){
  const per=budget/count,weight=100/count,status=i.status||'YELLOW';
  return `<article class="etf-card selected-card"><div class="selected-ribbon">SCELTO PER IL PAC · ${f(weight,0)}% · ${euro(per)}/mese</div><div class="etf-head"><div><small>${i.category||'ETF'} · ${role(i)}</small><h3>${i.name}</h3><span><b>${i.ticker}</b> · ${i.isin||''}</span></div><strong>${f(i.score)}/10</strong></div><p><span class="badge ${status}">${i.verdict||'SELEZIONATO'}</span></p>${chart(i)}<div class="metrics"><div><span>TER</span><strong>${f(i.ter,2)}%</strong></div><div><span>1 anno</span><strong>${f(i.return1y)}%</strong></div><div><span>3 anni ann.</span><strong>${f(i.return3y)}%</strong></div><div><span>5 anni ann.</span><strong>${f(i.return5y)}%</strong></div><div><span>10 anni ann.</span><strong>${f(i.return10y)}%</strong></div><div><span>Max drawdown</span><strong>${f(i.drawdown)}%</strong></div></div><div class="explain"><strong>Perché è nel portafoglio</strong><p>${why(i)}</p></div></article>`;
}
function commonMonthlyDates(etfs,years){
  const cut=new Date();cut.setFullYear(cut.getFullYear()-years);
  const maps=etfs.map(i=>new Map((i.monthlyHistory||[]).filter(x=>new Date(x.date)>=cut&&Number(x.price)>0).map(x=>[x.date,Number(x.price)])));
  if(!maps.length)return{dates:[],maps:[]};
  return{dates:[...maps[0].keys()].filter(d=>maps.every(m=>m.has(d))).sort(),maps};
}
function simulateReal(monthly,years,etfs){
  const per=monthly/etfs.length,{dates,maps}=commonMonthlyDates(etfs,years);let value=0;
  const details=etfs.map((i,idx)=>{let shares=0;dates.forEach(d=>shares+=per/maps[idx].get(d));const invested=per*dates.length,current=Number(i.currentPrice)||maps[idx].get(dates[dates.length-1])||0,val=shares*current;value+=val;return{i,invested,val,months:dates.length}});
  return{total:monthly*dates.length,value,details,months:dates.length};
}
function renderBuilder(){
  const budget=Math.max(25,Number($('#monthlyBudget').value)||250),years=Number($('#years').value)||5,picks=pick5(DATASET),per=budget/picks.length,weight=100/picks.length;
  $('#portfolioPlan').innerHTML=picks.map((i,n)=>`<div class="plan-row"><span><b>${n+1}. ${i.name}</b><small><strong>${i.ticker}</strong> · ${i.isin||'ISIN n.d.'} · ${role(i)}</small><small>${why(i)}</small></span><div class="allocation"><strong>${euro(per)}/mese</strong><small>${f(weight,0)}% del PAC</small></div></div>`).join('');
  const ready=picks.every(i=>Array.isArray(i.monthlyHistory)&&i.monthlyHistory.length);
  if(!ready){$('#pacSimulation').innerHTML='<div class="sim-title"><h3>Storico mensile in aggiornamento</h3><p>La simulazione apparirà quando tutti i 5 strumenti avranno dati reali.</p></div>';}else{
    const s=simulateReal(budget,years,picks),gain=s.value-s.total,pct=s.total?gain/s.total*100:0,requested=years*12;
    const coverage=s.months<requested?`<div class="history-warning"><strong>Storico comune disponibile: ${s.months} rate mensili.</strong> Il calcolo usa solo i mesi presenti per tutti i 5 strumenti.</div>`:'';
    $('#pacSimulation').innerHTML=`<div class="sim-title"><small>SIMULAZIONE SU ACQUISTI MENSILI REALI</small><h3>Come sarebbe andato questo PAC</h3><p>Ogni mese ${euro(budget)} vengono divisi tra i 5 strumenti selezionati.</p></div>${coverage}<div class="sim-grid"><div><span>Rata mensile</span><strong>${euro(budget)}</strong></div><div><span>Rate confrontabili</span><strong>${s.months}</strong></div><div><span>Totale versato</span><strong>${euro(s.total)}</strong></div><div><span>Valore oggi</span><strong>${euro(s.value)}</strong></div><div><span>Guadagno / perdita</span><strong>${gain>=0?'+':''}${euro(gain)} · ${pct>=0?'+':''}${f(pct)}%</strong></div></div><div class="pac-detail">${s.details.map(x=>`<div><span><b>${x.i.name}</b><small>${x.i.ticker} · ${x.months} rate</small></span><strong>${euro(x.invested)} → ${euro(x.val)}</strong></div>`).join('')}</div>`;
  }
  $('#cards').innerHTML=picks.map(i=>card(i,budget,picks.length)).join('');
}
fetch(DATA+'?v='+Date.now()).then(r=>r.json()).then(d=>{
  DATASET=d.etfs||[];const picks=pick5(DATASET);
  $('#summary').innerHTML=`<div class="summary-card"><small>ETF ANALIZZATI DAL MOTORE</small><strong>${d.screenedCount||DATASET.length}</strong></div><div class="summary-card"><small>SCELTI PER IL PAC</small><strong>${picks.length}</strong></div><div class="summary-card"><small>LOGICA</small><strong>CRESCITA + ORO</strong></div>`;
  renderBuilder();$('#monthlyBudget').addEventListener('input',renderBuilder);$('#years').addEventListener('change',renderBuilder);
});