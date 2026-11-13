/* The Discord bot scores each completed race and exports this snapshot. */
window.ASCRL_POWER = (() => {
  'use strict';
  const pageSize = 10;
  const byId = id => document.getElementById(id);
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const count = (n, noun) => n + ' ' + noun + (n === 1 ? '' : 's');
  function validate(feed) {
    if (!feed || feed.schema_version !== 1 || typeof feed.season !== 'string'
        || !feed.season.trim() || !Number.isInteger(feed.race_count) || feed.race_count < 0
        || !Array.isArray(feed.rankings?.Overall)) throw Error('Invalid power rankings feed');
    const categories = feed.mode === 'combined' ? ['Overall'] : Object.keys(feed.rankings);
    for (const series of categories) {
      const rows = feed.rankings[series];
      if (!Array.isArray(rows) || rows.some(d => !d || typeof d.name !== 'string'
          || !Number.isFinite(d.score) || !Number.isInteger(d.starts) || d.starts < 0
          || !Number.isInteger(d.wins) || d.wins < 0 || !(d.rank === null || Number.isInteger(d.rank) && d.rank > 0))) {
        throw Error('Invalid power rankings rows');
      }
    }
    return categories;
  }
  async function requested(path, hash) {
    const url = hash ? path + '?v=' + encodeURIComponent(hash) : path;
    const response = await fetch(url, {cache: 'no-store'});
    if (!response.ok) throw Error(path + ' HTTP ' + response.status);
    if (!hash) return response.json();
    const bytes = await response.arrayBuffer();
    if (window.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (hex !== hash) throw Error('Rankings do not yet match the published update');
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function load(getDriverImage, homePreseason) {
    const list = byId('power-list'), summary = byId('power-category'), update = byId('power-update');
    const pager = byId('power-pager'), pageInfo = byId('power-page');
    const prev = byId('power-prev'), next = byId('power-next'), tabs = byId('power-categories');
    if (!list) return;
    try {
      const manifest = await requested('website-sync.json');
      if (!manifest?.files || manifest.schema_version !== 1) throw Error('Invalid website update manifest');
      const hash = manifest.files['power-rankings.json'];
      const feed = await requested('power-rankings.json', hash), categories = validate(feed);
      // An older bot may still publish race results without a ratings snapshot.
      // A reset board is valid only until that first result; never present stale zeroes.
      if (!hash) {
        const season = await homePreseason;
        if (!season || !Array.isArray(season.events)) throw Error('Preseason results unavailable');
        if (feed.mode !== 'combined' || feed.season !== season.season || feed.race_count !== 0
            || season.events.some(event => Array.isArray(event.results) && event.results.length)) {
          summary.textContent = 'Ratings update pending'; update.textContent = season.season;
          list.replaceChildren(el('p', 'loading', 'The latest race results are in. Updated power rankings have not been published yet.'));
          byId('power-note').textContent = 'The official ratings will appear here when the Discord bot publishes them.';
          return;
        }
      }
      let category = 'Overall', page = 0;
      const combined = feed.mode === 'combined';
      byId('power-season').textContent = feed.season;
      byId('power-note').textContent = feed.race_count === 0
        ? 'Every driver starts at 0.0. The first race result will set the first rankings.'
        : 'Ratings update when race results are entered or corrected in Discord. Drivers without a start remain unranked.';
      function render() {
        const rows = feed.rankings[category];
        const start = page * pageSize, end = Math.min(start + pageSize, rows.length);
        const topScore = rows.reduce((max, r) => Math.max(max, r.score), 0);
        const fragment = document.createDocumentFragment();
        summary.textContent = combined ? 'Combined driver ratings' : category + ' driver ratings';
        update.textContent = count(feed.race_count, 'completed race') + ' · ' + count(rows.length, 'driver');
        for (const button of tabs.children) button.setAttribute('aria-pressed', String(button.dataset.category === category));
        if (!rows.length) fragment.append(el('p', 'loading', 'No drivers have been registered for this ranking yet.'));
        for (const d of rows.slice(start, end)) {
          const ranked = d.starts > 0 && d.rank !== null;
          const pct = topScore > 0 ? Math.max(0, Math.min(100, d.score / topScore * 100)) : 0;
          const row = el('div', 'power-entry'), pos = el('div', 'power-pos', ranked ? String(d.rank).padStart(2, '0') : '—');
          row.dataset.leader = String(ranked && d.rank === 1);
          row.style.setProperty('--rating-width', pct + '%');
          pos.setAttribute('aria-label', ranked ? 'Rank ' + d.rank : 'Unranked');
          const person = el('div', 'power-person'), portrait = el('img', 'driver-portrait');
          portrait.src = getDriverImage(d.name);
          portrait.loading = 'lazy'; portrait.alt = '';
          person.append(portrait, el('strong', '', d.name), el('small', '', d.starts ? count(d.starts, 'start') : 'Awaiting first start'));
          const wins = el('div', 'power-wins', d.wins); wins.append(el('span', '', d.wins === 1 ? 'WIN' : 'WINS'));
          const graph = el('div', 'power-graph'), bar = el('span');
          graph.setAttribute('aria-hidden', 'true'); bar.style.width = pct + '%'; graph.append(bar);
          const score = el('div', 'power-score', d.score.toFixed(1)); score.append(el('span', '', 'RATING'));
          row.append(pos, person, wins, graph, score); fragment.append(row);
        }
        list.replaceChildren(fragment);
        pager.hidden = rows.length <= pageSize;
        pageInfo.textContent = rows.length ? (start + 1) + '–' + end + ' of ' + rows.length : '';
        prev.disabled = page === 0; next.disabled = end >= rows.length;
      }
      tabs.replaceChildren();
      tabs.hidden = categories.length < 2;
      for (const categoryName of categories) {
        if (tabs.hidden) break;
        const button = el('button', '', categoryName);
        button.type = 'button'; button.dataset.category = categoryName;
        button.addEventListener('click', () => { category = categoryName; page = 0; render(); });
        tabs.append(button);
      }
      prev.addEventListener('click', () => { if (page > 0) { page--; render(); } });
      next.addEventListener('click', () => { if ((page + 1) * pageSize < feed.rankings[category].length) { page++; render(); } });
      render();
    } catch (error) {
      tabs.hidden = true; pager.hidden = true;
      summary.textContent = 'Driver ratings'; update.textContent = 'Feed unavailable';
      list.replaceChildren(el('p', 'error', 'The official power rankings could not be loaded. Please try again shortly.'));
      console.error('Power rankings:', error);
    }
  }
  return {load};
})();
