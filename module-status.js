(function(){
  const nodes=document.querySelectorAll('[data-module-status]');
  if(!nodes.length)return;
  const fmt=ts=>{
    if(!ts)return'non disponibile';
    try{return new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(ts));}
    catch{return ts;}
  };
  fetch('../data/update-status.json?v='+Date.now(),{cache:'no-store'})
    .then(r=>r.ok?r.json():Promise.reject(new Error('status')))
    .then(status=>nodes.forEach(n=>{
      const key=n.dataset.moduleStatus;
      const label=n.dataset.moduleLabel||key;
      const item=status[key];
      n.textContent=`Ultimo aggiornamento ${label}: ${fmt(item?.updatedAt)}`;
      n.dataset.ok=item?.ok?'true':'false';
    }))
    .catch(()=>nodes.forEach(n=>{n.textContent='Ultimo aggiornamento: non disponibile';n.dataset.ok='false';}));
})();
