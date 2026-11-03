/* Public racing data only. Season metadata comes from the Discord bot. */
window.ASCRL_DATA = {
  async read(file) {
    const res = await fetch(file + '?v=' + Math.floor(Date.now()/30000), {cache:'no-store'});
    if (!res.ok) throw new Error('Racing data unavailable');
    return res.json();
  },
  async catalog() {
    try {
      const data = await this.read('bot-seasons.json');
      if(data.schema_version !== 1 || !Array.isArray(data.seasons)) throw new Error('Invalid season catalog');
      data.seasons = data.seasons.filter(s => /^20\d\d(?:-\d\d)?$/.test(s.season) && /^ASCRL_Results_(?:20\d\d(?:-\d\d)?|Season_1)\.json$/.test(s.results) && Array.isArray(s.series));
      if(!data.seasons.length) throw new Error('Empty season catalog');
      return data;
    } catch(error) {
      return {current_season:'2026',seasons:[{season:'2026',results:'ASCRL_Results_2026.json',series:['Cup','Xfinity','Truck','Menards']},{season:'2025-26',results:'ASCRL_Results_Season_1.json',series:['Cup','Xfinity','Truck','Menards']}]};
    }
  },
  seasons(select, catalog) {
    select.replaceChildren(...catalog.seasons.map(s => new Option(s.season + (s.season===catalog.current_season?' Season':' Season · Archive'),s.season)));
    select.value = catalog.current_season;
  },
  series(container, season, catalog, selected, change) {
    const names = catalog.seasons.find(s=>s.season===season)?.series || ['Cup','Xfinity','Truck','Menards'];
    const current = names.includes(selected) ? selected : names[0];
    container.replaceChildren(...names.map(name=>{const b=document.createElement('button');b.type='button';b.className='series-btn'+(name===current?' active':'');b.dataset.series=name;b.textContent=name==='Truck'?'Trucks':name;b.addEventListener('click',()=>change(name));return b;}));
    return current;
  },
  escape(value) {return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
};
// Small status marker also refreshes a page left open when a deployment finishes.
(async()=>{
  const note=document.createElement('p');note.className='season-notice';note.setAttribute('role','status');note.style.cssText='max-width:1200px;margin:12px auto;padding:10px 18px;font-size:.85rem';
  const footer=document.querySelector('footer');if(footer)footer.before(note);
  let seen=null;
  async function check(){
    if(document.hidden)return;
    try{const data=await ASCRL_DATA.read('website-sync.json');if(!data.source_hash)return;
      if(seen && seen!==data.source_hash){location.reload();return;}
      seen=data.source_hash;const date=new Date(data.updated_at);note.textContent='Updated from ASCRL Discord · '+date.toLocaleString();
    }catch(error){note.textContent='ASCRL racing records';}
  }
  await check();setInterval(check,60000);
})();
