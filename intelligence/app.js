
const DATA_URL="../data/market-data.json";let payload=null,currentFilter="ALL";
const $=s=>document.querySelector(s);const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const fmt=(n,d=1)=>Number.isFinite(Number(n))?Number(n).toLocaleString("it-IT",{maximumFractionDigits:d,minimumFractionDigits:d}):"—";
function money(n){const x=Number(n);if(!Number.isFinite(x))return"—";if(x>=1e12)return fmt(x/1e12,1)+" T";if(x>=1e9)return fmt(x/1e9,1)+" mld";if(x>=1e6)return fmt(x/1e6,0)+" mln";return fmt(x,0)}
function ageText(iso){if(!iso)return"Età dati sconosciuta";const min=Math.max(0,Math.round((Date.now()-new Date(iso).getTime())/60000));if(min<60)return`Dati aggiornati ${min} min fa`;return`Dati aggiornati ${Math.floor(min/60)}h ${min%60}m fa`}
function sourceLink(i){const p=esc(i.publisher||"Fonte");return i.url?`<a class="source" href="${esc(i.url)}" target="_blank" rel="noopener"><strong>${p}</strong> · Apri fonte ↗</a>`:`<span class="source"><strong>${p}</strong> · link originale non disponibile</span>`}
function newsHtml(i){return `<article class="news-item"><div class="news-top"><strong>${esc(i.title)}</strong><span class="badge ${esc(i.direction)}">${i.direction==="POSITIVE"?"POSITIVA":i.direction==="NEGATIVE"?"NEGATIVA":"NEUTRA"}</span></div><p>${esc(i.whyItMatters)}</p>${sourceLink(i)}</article>`}
function renderMarket(){const t=$("#marketNews"),rows=payload?.market||[];if(!rows.length){t.innerHTML='<div class="empty">Nessuna intelligence di mercato disponibile.</div>';return}t.innerHTML=rows.map(a=>{const n=(a.news||[]).filter(x=>currentFilter==="ALL"||x.direction===currentFilter);return `<section class="market-card"><h3>${esc(a.name)}</h3><div class="themes">${(a.themes||[]).map(esc).join(" · ")}</div>${n.length?n.map(newsHtml).join(""):'<div class="empty">Nessuna notizia nel filtro selezionato.</div>'}</section>`}).join("")}

function renderCompanies(){
  const t=$("#companyIntel"), rows=payload?.companies||[];
  const quick=$("#companyQuickNav");
  if(!rows.length){
    if(quick) quick.innerHTML="";
    t.innerHTML='<div class="empty">Nessuna candidata Investment disponibile.</div>';
    return;
  }

  if(quick){
    quick.innerHTML=rows.map(i=>`<a href="#company-${esc(i.ticker)}">${esc(i.ticker)} · ${esc(i.name)}</a>`).join("");
  }

  t.innerHTML=rows.map((i,k)=>{
    const p=i.profile||{};
    return `<article class="company-card" id="company-${esc(i.ticker)}" data-ticker="${esc(i.ticker)}">
      <div class="company-head">
        <div>
          <small>#${i.rank||k+1} · ${esc(i.ticker)} · ${esc(i.sector||"")}</small>
          <h3>${esc(i.name)}</h3>
        </div>
        <div class="company-rank">${fmt(i.score,1)}/10</div>
      </div>
      <div class="profile-grid">
        <div><span>Paese</span><strong>${esc(p.country||"—")}</strong></div>
        <div><span>Sede</span><strong>${esc(p.city||"—")}</strong></div>
        <div><span>CEO</span><strong>${esc(p.ceo||"—")}</strong></div>
        <div><span>Settore / industria</span><strong>${esc(p.industry||i.sector||"—")}</strong></div>
        <div><span>Capitalizzazione</span><strong>${money(p.marketCap)}</strong></div>
      </div>
      <p class="description">${esc(p.description||"Descrizione aziendale non disponibile dalla fonte gratuita.")}</p>
      ${p.website?`<p><a href="${esc(p.website)}" target="_blank" rel="noopener">Sito ufficiale dell'azienda ↗</a></p>`:""}
      <div class="reason-box">
        <strong>Perché è tra le candidate</strong>
        <p>${esc(i.executiveSummary||i.whySelected||"")}</p>
      </div>
      <div class="memory-intel">
        <span>${esc(i.memory?.badge||"Nuovo candidato")}</span>
        <span>Top5 ${i.memory?.consecutiveTop5Days||0} gg</span>
        <span>Stabilità ${fmt(i.memory?.stabilityScore,1)}/10</span>
        <span>Fiducia ${fmt(i.memory?.confidencePct,0)}%</span>
      </div>
      <div class="two-col">
        <div><span>CATALIZZATORI</span><ul>${(i.catalysts||[]).map(x=>`<li>${esc(x)}</li>`).join("")||"<li>—</li>"}</ul></div>
        <div><span>RISCHI CHE POSSONO CAMBIARE LA TESI</span><ul>${(i.risks||[]).map(x=>`<li>${esc(x)}</li>`).join("")||"<li>—</li>"}</ul></div>
      </div>
      <div class="company-news">
        <h4>Notizie collegate e fonti</h4>
        ${(i.news||[]).length?(i.news||[]).map(newsHtml).join(""):'<div class="empty">Nessuna notizia recente restituita dalla fonte dati.</div>'}
      </div>
      <p class="back-invest"><a href="../investing/">← Torna all'Investment Coach</a></p>
    </article>`
  }).join("");

  const params=new URLSearchParams(location.search);
  const ticker=params.get("ticker");
  if(ticker){
    requestAnimationFrame(()=>{
      const target=document.getElementById(`company-${ticker}`);
      if(target){
        target.classList.add("highlight-company");
        target.scrollIntoView({behavior:"smooth",block:"start"});
      }
    });
  }
}
async function load(){try{const r=await fetch(`${DATA_URL}?ts=${Date.now()}`,{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);const root=await r.json();payload=root.intelligence||{};$("#freshness").textContent=ageText(payload.generatedAt||root.generatedAt);renderMarket();renderCompanies()}catch(e){$("#freshness").textContent="Errore caricamento";$("#marketNews").innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");currentFilter=b.dataset.filter;renderMarket()}));
load();setInterval(load,5*60*1000);
