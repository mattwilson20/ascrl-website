/* Read live identities and current preseason alongside immutable completed-season records. */
window.ASCRL_DRIVER_HISTORY = (() => {
  'use strict';
  let archived={}, preseason=null, live={};
  const normalize=value=>String(value||'').replace(/^#\d+\s+/, '').trim().toLowerCase();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  async function read(file){const r=await fetch(file,{cache:'no-store'});if(!r.ok)throw Error('Driver record unavailable');return r.json();}
  function merge(current, saved, active){
    const all={};
    for(const id of new Set([...Object.keys(saved),...Object.keys(current)])){
      const a=saved[id]||{},b=current[id]||{};
      all[id]={...a,...b,badges:[...new Set([...(a.badges||[]),...(b.badges||[])])],series:{...(a.series||{}),...(b.series||{})}};
    }
    for(const row of active?.standings||[]){
      const id=Object.keys(all).find(id=>normalize(all[id].display_name||id)===normalize(row.driver)||normalize(saved[id]?.display_name)===normalize(row.driver));
      if(!id)all['preseason:'+row.driver]={display_name:row.driver,badges:[],series:{Preseason:{number:'',team:'',manufacturer:''}}};
    }
    return all;
  }
  async function load(){
    const results=await Promise.allSettled([read('drivers.json'),read('history/2026/drivers.json'),read('preseason.json')]);
    if(results[0].status==='rejected'&&results[1].status==='rejected')throw Error('No driver data');
    live=results[0].status==='fulfilled'?results[0].value:{};archived=results[1].status==='fulfilled'?results[1].value:{};
    const p=results[2].status==='fulfilled'?results[2].value:null;
    preseason=p?.schema_version===2&&p?.season==='2026-2027 Preseason'&&Array.isArray(p.standings)?p:null;
    return merge(live,archived,preseason);
  }
  function records(id,driver,saved=archived,active=preseason){
    const byKey=new Map();
    function add(season,series,stats){if(stats&&typeof stats==='object')byKey.set(season+'|'+series,{season:String(season),series,stats});}
    function addDriver(d,frozen){
      for(const [series,s] of Object.entries(d?.series||{})){
        for(const h of s.history||[])add(h.season,series,h.stats);
        for(const [season,stats] of Object.entries(s.season_stats||{}))add(season,series,stats);
        // Only this dated snapshot can identify unversioned stats as 2026.
        if(frozen&&!s.season_stats?.['2026']&&series!=='Preseason')add('2026',series,s.current_stats||s.stats);
      }
    }
    addDriver(driver,false);addDriver(saved[id],true);
    const list=[...byKey.values()].sort((a,b)=>b.season.localeCompare(a.season)||a.series.localeCompare(b.series));
    const names=[driver.display_name||id,saved[id]?.display_name].filter(Boolean).map(normalize);
    const row=active?.standings?.find(r=>names.includes(normalize(r.driver)));
    if(row)list.unshift({season:'2026–2027 Preseason',series:'Combined',stats:{...row,avg:row.avg_finish},active:true});
    return list;
  }
  function table(headers,rows){
    const wrap=el('div',null,'table-wrapper');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Driver statistics');
    const t=el('table',null,'stat-table'),head=t.createTHead().insertRow();for(const h of headers){const th=el('th',h);th.scope='col';head.append(th);}
    const body=t.createTBody();for(const values of rows){const tr=body.insertRow();for(const value of values)tr.insertCell().textContent=value??'—';}wrap.append(t);return wrap;
  }
  const number=value=>typeof value==='number'&&!Number.isInteger(value)?value.toFixed(2):value;
  function enhance(id,driver,series){
    const seasonPanel=document.getElementById('mod-tab-season'),careerPanel=document.getElementById('mod-tab-career');
    const list=records(id,driver),control=el('div',null,'driver-season-control');
    const label=el('label','Choose a season and series');label.htmlFor='driver-season-select';
    const select=el('select');select.id=label.htmlFor;
    list.forEach((r,i)=>{const o=el('option',r.season+' · '+r.series+(r.active?' · Current preseason':''));o.value=i;select.append(o);});
    const preferred=list.findIndex(r=>r.active);const fallback=list.findIndex(r=>r.series===series&&r.season==='2026');select.value=String(preferred>=0?preferred:fallback>=0?fallback:0);
    control.append(label,select);const body=el('div');
    seasonPanel.replaceChildren(control,body);
    function show(){
      const r=list[Number(select.value)];
      if(!r){body.replaceChildren(el('p','Season statistics will appear after a published result.','driver-record-note'));control.hidden=true;return;}
      const keys=['starts','wins','top5','top10','poles','avg','points'];const headings=['Starts','Wins','Top 5','Top 10','Poles','Avg finish','Points'];
      if(r.active){keys.push('stage_points','stage_wins');headings.push('Stage points','Stage wins');}
      body.replaceChildren(el('h3',r.season+' · '+r.series),table(headings,[keys.map(k=>number(r.stats[k]))]),el('p',r.active?'One combined preseason championship. Official totals include stage points and league deductions.':'Completed-season record. These statistics stay on the driver card when the next season begins.','driver-record-note'));
    }
    select.addEventListener('change',show);show();
    careerPanel.replaceChildren(el('h3','SEASON-BY-SEASON RESULTS'),el('p','All recorded series and seasons. Xfinity retains its historical name; current O’Reilly Auto Parts racing is ORAP.','driver-record-note'),table(['Season','Series','Starts','Points','Wins','Top 5','Top 10','Poles','Avg finish'],list.map(r=>[r.season,r.series,...['starts','points','wins','top5','top10','poles','avg'].map(k=>number(r.stats[k]))])));
    const totals=Object.entries(driver.series||{}).filter(([,s])=>s.career_stats).map(([name,s])=>[name,...['starts','points','wins','top5','top10','poles','avg'].map(k=>number(s.career_stats[k]))]);
    if(totals.length)careerPanel.append(el('h3','PUBLISHED CAREER TOTALS'),el('p','Career totals as supplied by the league feed; preseason remains listed separately above.','driver-record-note'),table(['Series','Starts','Points','Wins','Top 5','Top 10','Poles','Avg finish'],totals));
    const badges=document.querySelector('.p-badges');
    for(const [name,c] of Object.entries(window.ASCRL_SEASON?.champions||{})){
      if([driver.display_name,archived[id]?.display_name].some(n=>normalize(n)===normalize(c.driver)))badges?.append(el('span','★ 2026 '+name+' champion','season-champion-badge'));
    }
    const note=el('p',Object.keys(archived).length?'Past seasons and championships remain part of this driver’s record.':'Historical records are temporarily unavailable. Reload to view the complete card.','driver-record-note');
    careerPanel.append(note);
    const modal=document.getElementById('driver-modal');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',(driver.display_name||id)+' driver card');
    const close=modal.querySelector('.close');if(close)close.focus();
  }
  return {load,records,merge,enhance,normalize,escape};
})();
