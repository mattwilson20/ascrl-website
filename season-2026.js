/* Official league announcement, 16 October 2026. Historical Xfinity records keep their name. */
window.ASCRL_SEASON = (() => {
  const champions = {
    Cup: { name: 'Scott', driver: 'Scott247_', image: 'Scotthero.jpg', number: '7' },
    Xfinity: { name: 'Dakota', driver: 'dakotathomas1994', image: 'IMG_7125.jpg', number: '9' },
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
    return c ? '<strong>★ 2026 ' + series + ' champion: ' + c.name + ' · ' + c.driver + '</strong><span>Season concluded by agreement among the championship contenders. All remaining races are cancelled.</span>' : '<strong>Truck championship · The battle continues</strong><span>The 2026 Truck season is still racing. Follow the remaining events and the fight for the title.</span>';
  };
  return { champions, preseason, champion, isChampion, badge, notice };
})();
