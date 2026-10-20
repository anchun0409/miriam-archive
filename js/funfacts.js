(async function () {
  const root = document.getElementById("funfacts");
  await DataLayer.load();
  const f = DataLayer.funFacts();

  const [y, m] = (f.asOf || "").split("-");
  const asOfText = y && m ? `${y}-${m}` : "—";

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const topShows = f.topSongCountShows
    .map((row, i) => {
      const c = row.concert;
      const s = row.session;
      return `<li><span class="ff-rank">Top ${i + 1}</span>
        <span class="ff-main">${escapeHtml(c.concert_name)}</span>
        <span class="ff-sub">（${escapeHtml(s.city)} ${escapeHtml(s.date)}）· ${row.count} 首</span>
      </li>`;
    })
    .join("");

  const topSongs = f.topSongs
    .map(
      (row, i) =>
        `<li><span class="ff-rank">${i + 1}.</span>
          <span class="ff-main">${escapeHtml(row.song.title)}</span>
          <span class="ff-sub">${row.times} 次</span>
        </li>`
    )
    .join("");

  const topCities = f.topCities
    .map(
      (row, i) =>
        `<li><span class="ff-rank">${i + 1}.</span>
          <span class="ff-main">${escapeHtml(row.city)}</span>
          <span class="ff-sub">${row.times} 場</span>
        </li>`
    )
    .join("");

  let encoreBlock = `<p class="ff-empty">暫無 Encore 資料。</p>`;
  if (f.encoreKing) {
    const sessList = f.encoreKing.sessions
      .slice(0, 40)
      .map(
        (s) =>
          `<li>${escapeHtml(s.date)} · ${escapeHtml(s.city)} · ${escapeHtml(s.concert_name)}</li>`
      )
      .join("");
    const more =
      f.encoreKing.sessions.length > 40
        ? `<li>…另有 ${f.encoreKing.sessions.length - 40} 場</li>`
        : "";
    encoreBlock = `
      <p class="ff-lead"><strong>${escapeHtml(f.encoreKing.song.title)}</strong> · 安可 ${f.encoreKing.times} 次</p>
      <ul class="ff-session-list">${sessList}${more}</ul>`;
  }

  const minorList = f.minorThenMain.length
    ? f.minorThenMain
        .map(
          (row) =>
            `<li><span class="ff-main">${escapeHtml(row.song.title)}</span>
              <span class="ff-sub">首次：${escapeHtml(row.first_date)} · ${escapeHtml(row.first_concert)}</span>
            </li>`
        )
        .join("")
    : `<li class="ff-empty">暫無符合條件的歌曲。</li>`;

  root.innerHTML = `
    <section class="ff-section">
      <h2>演唱會場次</h2>
      <p class="ff-lead">截至 ${asOfText}，千嬅已經開了 <strong>${f.totalShows}</strong> 場演唱會，其中 <strong>${f.personalShows}</strong> 場為個人演唱會。</p>
    </section>

    <section class="ff-section">
      <h2>單場曲目數最高</h2>
      <ol class="ff-list">${topShows}</ol>
    </section>

    <section class="ff-section">
      <h2>Top 10 演唱會曲目</h2>
      <p class="ff-note">按演唱次數（含 Encore）</p>
      <ol class="ff-list">${topSongs}</ol>
    </section>

    <section class="ff-section">
      <h2>Top 5 演唱會城市</h2>
      <ol class="ff-list">${topCities}</ol>
    </section>

    <section class="ff-section">
      <h2>Encore 之王</h2>
      ${encoreBlock}
    </section>

    <section class="ff-section">
      <h2>從 Minor 走進主 Rundown</h2>
      <p class="ff-note">首次演出於 Minor Classics / B minor，其後在其他演唱會進入主歌單</p>
      <ul class="ff-list">${minorList}</ul>
    </section>
  `;
})();
