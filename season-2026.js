/* Official league announcement, 10 November 2026. Historical Xfinity records keep their name. */
window.ASCRL_SEASON = (() => {
  const champions = {
    Cup: { name: 'Scott', driver: 'Scott247_', image: 'Scotthero.jpg', number: '7' },
    Xfinity: { name: 'Dakota', driver: 'dakotathomas1994', image: 'IMG_7125.jpg', number: '9' },
    Truck: { name: 'Mike', driver: 'Mike_8762', image: 'Mikehero.jpg', number: '05' },
    Menards: { name: 'Scott', driver: 'Scott247_', image: 'Scotthero.jpg', number: '7' }
  };
  const preseason = [
    { date: '2026-11-17', track: 'Chicagoland', series: 'Cup' },
    { date: '2026-11-19', track: 'Las Vegas', series: 'ORAP' },
    { date: '2026-12-01', track: 'Daytona', series: 'Truck' },
    { date: '2026-12-03', track: 'Richmond', series: 'Cup' },
    { date: '2026-12-08', track: 'San Diego', series: 'ORAP' },
    { date: '2026-12-10', track: 'North Wilkesboro', series: 'Truck' },
    { date: '2026-12-15', track: 'Atlanta', series: 'Cup' },
    { date: '2026-12-17', track: 'Talladega', series: 'ORAP' },
    { date: '2026-12-22', track: 'Michigan', series: 'Truck' },
    { date: '2026-12-29', track: 'San Diego', series: 'Cup' },
    { date: '2027-01-05', track: 'Martinsville', series: 'ORAP' },
    { date: '2027-01-07', track: 'St. Pete', series: 'Truck' }
  ];
  const champion = series => champions[series] || null;
  const isChampion = (name, series) => champion(series)?.driver.toLowerCase() === String(name).toLowerCase();
  const badge = (name, series) => isChampion(name, series) ? '<span class="season-champion-badge">★ 2026 ' + series + ' champion</span>' : '';
  const notice = (series, year = '2026') => {
    if (year !== '2026') return '';
    const c = champion(series);
    if (!c) return '';
    const detail = series === 'Truck' ? 'Final standings: Mike finished with 2,314 points, 13 ahead of the_fireman199.' : 'Season concluded by agreement among the championship contenders. The remaining races were cancelled.';
    return '<strong>★ 2026 ' + series + ' champion: ' + c.name + ' · ' + c.driver + '</strong><span>' + detail + '</span>';
  };
  return { champions, preseason, champion, isChampion, badge, notice };
})();
