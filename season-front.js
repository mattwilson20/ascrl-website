/* Only the active preseason feed supplies the front page. Historical records have their own pages. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => {const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  const link = name => 'drivers.html?driver='+encodeURIComponent(name);
  const date = value => new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const isCancelled = e => e.cancelled===true || /cancelled|canceled/i.test(e.status||'');
  function state(data, day=today()) {
    if(data.schema_version!==2 || data.season!=='2026-2027 Preseason' || !Array.isArray(data.events) || !Array.isArray(data.standings))throw Error('Unexpected preseason data');
    if(data.events.some(e=>!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || typeof e.track!=='string' || !Array.isArray(e.results)))throw Error('Invalid event');
    const events=data.events.slice().sort((a,b)=>a.date.localeCompare(b.date));
    const complete=events.filter(e=>e.results.length && !isCancelled(e));
    const upcoming=events.filter(e=>!e.results.length && !isCancelled(e) && e.date>=day);
    return {events,complete,upcoming,ended:events.length>0 && !upcoming.length && (complete.length===events.length || events.at(-1).date<day)};
  }
  function picture(name,cls){const img=el('img',null,cls);img.src=window.ASCRL_DRIVER_IMAGE(name);img.alt=name;img.loading='lazy';return img;}
  function render(data){
    const s=state(data);
    $('now-completed').textContent=String(s.complete.length).padStart(2,'0');
    $('now-remaining').textContent=String(s.upcoming.length).padStart(2,'0');
    const next=s.upcoming[0];
    if(next){
      $('next-track').textContent=next.track;$('next-meta').textContent=date(next.date)+' · '+next.date.slice(0,4);
      $('next-detail').textContent='Preseason Thunder · Join Discord for race entry and the latest event announcements.';
      if(!s.complete.length)$('now-phase').textContent='A new preseason is on the grid. Come race with us.';
    }else{
      $('next-tag').textContent='THE NEXT CHAPTER';$('next-track').textContent='More racing ahead.';
      $('next-meta').textContent='Watch for the next confirmed race announcement.';
      $('next-detail').textContent='Join the league on Discord for upcoming dates and entry details.';
      if(s.ended){$('now-phase').textContent='The next chapter is ahead. Come race with us.';document.querySelector('.now-intro .now-kicker').textContent='ASCRL · THE ROAD TO THE NEXT SEASON';}
    }
    const events=s.upcoming.slice(0,4).map((e,i)=>{const a=el('a',null,'now-event');a.href='preseason.html#preseason-dates-title';const t=el('time',date(e.date));t.dateTime=e.date;a.append(t,el('strong',e.track),el('small',i===0?'NEXT RACE ↗':'PRESEASON THUNDER ↗'));return a;});
    $('event-list').replaceChildren(...(events.length?events:[el('p','New race dates will appear here when announced. Follow Discord for the next opportunity to join the grid.','now-empty')]));
    const rows=data.standings.slice().sort((a,b)=>a.rank-b.rank);
    if(rows.length){
      const table=el('table',null,'points');table.setAttribute('aria-label','Current combined preseason standings');
      const head=table.createTHead().insertRow();for(const name of ['Rank','Driver','Starts','Wins','Points']){const th=el('th',name);th.scope='col';head.append(th);}
      for(const row of rows.slice(0,6)){const tr=(table.tBodies[0]||table.createTBody()).insertRow();for(const [key,cls] of [['rank','place'],['driver','driver'],['starts','wins'],['wins','wins'],['points','score']]){const td=tr.insertCell();td.className=cls;if(key==='driver'){const a=el('a',row.driver);a.href=link(row.driver);td.append(a);}else td.textContent=row[key]??'—';}}
      $('standings-table').replaceChildren(table);
      const leader=rows[0];$('leader-name').textContent=leader.driver;$('leader-profile').href=link(leader.driver);
      $('leader-score').replaceChildren(document.createTextNode(String(leader.points)+' '),el('span','POINTS'));
      $('leader-status').textContent=leader.starts+' start'+(leader.starts===1?'':'s')+' · Official combined preseason total, including stage points.';
      $('leader-photo').src=window.ASCRL_DRIVER_IMAGE(leader.driver);$('leader-photo').alt=leader.driver;$('leader-photo').hidden=false;
    }else{$('standings-table').replaceChildren(el('p','The points table starts with the first published race. There is still time to join the grid.','loading'));}
    const cards=s.complete.slice(-3).reverse().map(event=>{
      const winner=event.results.find(r=>Number(r.position)===1);
      const card=el('article',null,'race-card now-result');
      if(winner){const a=el('a',null,'race-image');a.href=link(winner.driver);a.append(picture(winner.driver));card.append(a);}
      const text=el('div',null,'text');text.append(el('span',date(event.date)+' · PRESEASON','ribbon'),el('h3',event.track));
      if(winner){const a=el('a','RACE WINNER · '+winner.driver,'now-winner-link');a.href=link(winner.driver);text.append(a);}
      text.append(el('p','The latest chapter of Preseason Thunder. View the full finishing order and stage results.'));
      const a=el('a','VIEW RACE & STAGE RESULTS ↗','season-link');a.href='preseason.html#preseason-results';text.append(a);card.append(text);return card;
    });
    $('results-grid').replaceChildren(...(cards.length?cards:[el('p','The first checkered flag is still ahead. Race reports will appear here after they are published.','now-empty')]));
  }
  const feed=fetch('preseason.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Preseason unavailable');return r.json();}).then(data=>{state(data);return data;});
  feed.then(render).catch(()=>{
    for(const id of ['event-list','standings-table','results-grid'])$(id).replaceChildren(el('p','Current preseason data is temporarily unavailable. Visit the preseason hub or Discord for race updates.','now-empty'));
    $('leader-name').textContent='STANDINGS UNAVAILABLE';$('leader-status').textContent='Please check back for the current preseason update.';
  });
  if(window.ASCRL_POWER)window.ASCRL_POWER.load(window.ASCRL_DRIVER_IMAGE,feed);
  // Expose the pure calendar selector for regression checks and future season transitions.
  window.ASCRL_FRONT={state};
})();
