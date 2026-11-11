/* The Discord bot publishes official totals. Stage points are already included. */
(async () => {
  const target = document.getElementById('preseason-results');
  const board = document.getElementById('preseason-standings');
  if (!target || !board) return;

  function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  const paragraph = text => element('p', text, 'preseason-copy');
  const dateFormat = options => new Intl.DateTimeFormat('en-US', {...options, timeZone: 'UTC'});
  const shortDate = dateFormat({month: 'short', day: '2-digit'});
  const dayOfWeek = dateFormat({weekday: 'short'});
  const fullDate = dateFormat({month: 'short', day: 'numeric', year: 'numeric'});

  function standingsTable(label, headers, rows) {
    const wrap = element('div', null, 'score-scroll');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', label);
    const table = element('table', null, 'score-table');
    table.setAttribute('aria-label', label);
    const head = table.createTHead().insertRow();
    const nameColumn = headers.indexOf('Driver');
    for (const [index, title] of headers.entries()) {
      const th = element('th', title, index === nameColumn ? '' : 'numeric');
      th.scope = 'col';
      head.append(th);
    }
    const body = table.createTBody();
    for (const cells of rows) {
      const tr = body.insertRow();
      for (const [index, value] of cells.entries()) {
        const cell = tr.insertCell();
        cell.className = index === nameColumn ? 'score-driver' : 'numeric';
        if (headers[index] === 'Total pts') cell.classList.add('score-total');
        cell.append(value ?? '—');
      }
    }
    wrap.append(table);
    return wrap;
  }

  function driverCell(result) {
    const name = element('span', result.driver);
    const awards = [];
    if (['yes','1','true','pole'].includes(String(result.pole).toLowerCase())) awards.push('Pole');
    if (['fl','yes','1','true'].includes(String(result.fl).toLowerCase())) awards.push('Fastest lap');
    if (awards.length) name.append(element('small', awards.join(' · '), 'result-awards'));
    return name;
  }

  function stageReport(results, number, label) {
    const position = 'stage' + number + '_position';
    const classified = results.filter(row => Number.isInteger(row[position]) && row[position] > 0)
      .sort((a, b) => a[position] - b[position]);
    const section = element('section', null, 'stage-result');
    const title = 'Stage ' + number;
    section.append(element('h4', title));
    if (!classified.length) {
      section.append(element('p', 'Stage finishes have not been posted.', 'stage-pending'));
      return section;
    }
    const scoring = classified.filter(row => row[position] <= 10);
    section.append(standingsTable(label + ' · ' + title, ['Pos', 'Driver', 'Pts'],
      scoring.map(row => [row[position], row.driver, 11 - row[position]])));
    return section;
  }

  function raceReport(event, label, open) {
    const detail = element('details', null, 'preseason-race');
    detail.open = open;
    detail.append(element('summary', label));
    const report = element('div', null, 'race-classification');
    const staged = event.results.some(row => Number.isInteger(row.stage1_position) || Number.isInteger(row.stage2_position));
    report.append(element('h3', 'Race finish'));
    const headers = staged ? ['Pos', 'Driver', 'Race pts', 'Stage pts', 'Total pts'] : ['Pos', 'Driver', 'Total pts'];
    const rows = event.results.map(row => {
      const cells = [row.position, driverCell(row)];
      if (staged) {
        const bonus = row.stage_points ?? 0;
        cells.push(row.points - bonus, bonus);
      }
      cells.push(row.points);
      return cells;
    });
    report.append(standingsTable(label + ' · Race finish', headers, rows));
    if (staged) report.append(element('p', 'Race points include any pole and fastest-lap bonuses. Stage points include both posted stages.', 'result-note'));
    const pair = element('div', null, 'stage-pair');
    pair.append(stageReport(event.results, 1, label), stageReport(event.results, 2, label));
    report.append(element('h3', 'Stage finishes'), pair);
    detail.append(report);
    return detail;
  }

  try {
    const response = await fetch('preseason.json', {cache: 'no-store'});
    if (!response.ok) throw Error('Preseason export unavailable');
    const data = await response.json();
    if (data.schema_version !== 2 || data.season !== '2026-2027 Preseason' || !Array.isArray(data.events) || !Array.isArray(data.standings)) throw Error('Unexpected preseason export');
    if (data.events.some(e => !e || typeof e.track !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !Array.isArray(e.results))) throw Error('Invalid event');

    const events = data.events.slice().sort((a,b) => a.date.localeCompare(b.date));
    const schedule = document.createDocumentFragment();
    const complete = [];
    for (const event of events) {
      const date = new Date(event.date + 'T12:00:00Z');
      const time = element('time', shortDate.format(date));
      time.dateTime = event.date;
      time.append(element('small', dayOfWeek.format(date) + ' · ' + event.date.slice(0,4)));
      const item = element('li');
      item.append(time, element('strong', event.track));
      schedule.append(item);
      if (event.results.length) complete.push({event, label: event.track + ' · ' + fullDate.format(date)});
    }
    const reports = complete.reverse().map(({event, label}, index) => raceReport(event, label, index === 0));
    const boardBody = document.createDocumentFragment();
    boardBody.append(element('h2', 'Combined preseason standings'), paragraph('All twelve races count toward one championship. The points total includes earned stage points and any league deductions.'));
    if (data.standings.length) {
      const showStages = data.standings.some(row => Number.isInteger(row.stage_points));
      const headers = ['Rank','Driver','Starts','Wins'];
      if (showStages) headers.push('Stage pts');
      headers.push('Total pts');
      const rows = data.standings.map(row => {
        const cells = [row.rank, row.driver, row.starts, row.wins];
        if (showStages) cells.push(row.stage_points ?? 0);
        return [...cells, row.points];
      });
      boardBody.append(standingsTable('Combined preseason championship standings', headers, rows));
    } else boardBody.append(paragraph('Standings will appear after the first published race.'));

    if (events.length) document.querySelector('.preseason-dates')?.replaceChildren(schedule);
    board.replaceChildren(boardBody);
    target.replaceChildren(element('h2','Preseason race results'));
    target.append(paragraph(complete.length ? complete.length + ' of ' + events.length + ' races have published results. Open a race for the finishing order and both stages.'
      : 'The first race report will appear here after Chicagoland. Each report includes the race finish, Stage 1 and Stage 2.'), ...reports);
  } catch (error) {
    board.replaceChildren(element('h2','Combined preseason standings'), paragraph('Standings are unavailable right now. Check back after the next published update.'));
    target.replaceChildren(element('h2','Preseason race results'), paragraph('Race results are not available right now. Check back after the next published update.'));
    console.warn('Could not load preseason race data:', error.message);
  }
})();
