/* Public racing data only. Virtual currency is never part of this contract. */
(async () => {
  const target = document.getElementById('preseason-results');
  if (!target) return;
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  try {
    const response = await fetch('preseason.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('Preseason export unavailable');
    const data = await response.json();
    if (data.schema_version !== 1 || data.season !== '2026-2027 Preseason' || !Array.isArray(data.events)) throw new Error('Unexpected preseason export');
    const events = data.events;
    if (events.some(e => !['Cup','ORAP','Truck'].includes(e.series) || typeof e.track !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !Array.isArray(e.results))) throw new Error('Invalid event');
    events.sort((a,b) => a.date.localeCompare(b.date));
    const list = document.querySelector('.preseason-dates');
    const schedule = document.createDocumentFragment();
    const reports = document.createDocumentFragment();
    let completed = 0;
    for (const event of events) {
      const date = new Date(event.date + 'T12:00:00Z');
      if (Number.isNaN(date.getTime())) throw new Error('Invalid event date');
      const item = node('li');
      const time = node('time', date.toLocaleDateString('en-US', {month:'short',day:'2-digit',timeZone:'UTC'}));
      time.dateTime = event.date;
      time.append(node('small', date.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})+' · '+event.date.slice(0,4)));
      item.append(time,node('strong',event.track),node('span',event.series.toUpperCase(),'preseason-series'));
      schedule.append(item);
      if (!event.results.length) continue;
      completed++;
      const detail = node('details');
      detail.style.cssText='margin:14px 0;padding:16px;border:1px solid #44505c;border-radius:8px';
      const summary = node('summary',`${event.series} · ${event.track} · ${event.date}`);
      summary.style.cssText='cursor:pointer;font-weight:700';
      const wrap = node('div');
      wrap.style.cssText='overflow-x:auto;margin-top:14px';
      const table = node('table');
      table.style.cssText='width:100%;border-collapse:collapse;text-align:left';
      table.append(node('caption',`${event.series} at ${event.track} — finishing order`));
      const head = node('tr');
      for (const title of ['Pos','Driver','Points','Awards']) {
        const th=node('th',title);th.scope='col';th.style.padding='8px';head.append(th);
      }
      const thead=node('thead');thead.append(head);table.append(thead);
      const body=node('tbody');
      for (const result of event.results) {
        const row=node('tr');
        const badges=[];
        if (['yes','1','true','pole'].includes(String(result.pole).toLowerCase())) badges.push('Pole');
        if (['fl','yes','1','true'].includes(String(result.fl).toLowerCase())) badges.push('Fastest lap');
        for (const value of [result.position,result.driver,result.points,badges.join(' · ') || '—']) {
          const td=node('td',String(value ?? '—'));td.style.cssText='padding:8px;border-top:1px solid #44505c';row.append(td);
        }
        body.append(row);
      }
      table.append(body);wrap.append(table);detail.append(summary,wrap);reports.append(detail);
    }
    if (list && events.length) list.replaceChildren(schedule);
    target.replaceChildren(node('h2','Preseason race results'));
    if (completed) {
      target.append(node('p',`${completed} of ${events.length} races have published results. Select a race to view the finishing order.`,'preseason-copy'),reports);
    } else {
      target.append(node('p','Results will appear here after the first preseason race is completed and published.','preseason-copy'));
    }
  } catch (error) {
    // Keep the official printed calendar visible if a file is unavailable or malformed.
    target.replaceChildren(node('h2','Preseason race results'),node('p','Race results are not available right now. Check back after the next published update.','preseason-copy'));
    console.warn('Could not load preseason race data:', error.message);
  }
})();
