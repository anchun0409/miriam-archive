(async function () {
  const root = document.getElementById("funfacts");
  if (!root) return;

  root.innerHTML = `<p class="ff-empty">載入中…</p>`;

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  try {
    if (!window.DataLayer || typeof DataLayer.load !== "function") {
      throw new Error("DataLayer 未載入，請確認 js/data.js 路徑正確。");
    }

    await DataLayer.load();

    if (typeof DataLayer.funFacts !== "function") {
      throw new Error("DataLayer.funFacts 不存在，請重新整理或更新 js/data.js。");
    }

    const f = DataLayer.funFacts();
    const [y, m] = (f.asOf || "").split("-");
    const asOfText = y && m ? `${y}-${m}` : "—";

    const topShows = (f.topSongCountShows || [])
      .map((row, i) => {
        const c = row.concert;
        const s = row.session;
        return `<li>
          <span class="ff-rank">Top ${i + 1}</span>
          <span class="ff-main">${escapeHtml(c.concert_name)}</span>
          <span class="ff-sub">（${escapeHtml(s.city)} ${escapeHtml(s.date)}）· ${row.count} 首</span>
        </li>`;
      })
      .join("");

    const topSongs = (f.topSongs || [])
      .map(
        (row, i) => `<li>
          <span class="ff-rank">${i + 1}.</span>
          <span class="ff-main">${escapeHtml(row.song.title)}</span>
          <span class="ff-sub">${row.times} 次</span>
        </li>`
      )
      .join("");

    const topCities = (f.topCities || [])
      .map(
        (row, i) => `<li>
          <span class="ff-rank">${i + 1}.</span>
          <span class="ff-main">${escapeHtml(row.city)}</span>
          <span class="ff-sub">${row.times} 場</span>
        </li>`
      )
      .join("");

    let encoreBlock = `<p class="ff-empty">暫無 Encore 資料。</p>`;
    if (f.encoreKing && f.encoreKing.song) {
      const sessList = (f.encoreKing.sessions || [])
        .map(
          (s) =>
            `<li>${escapeHtml(s.date)} · ${escapeHtml(s.city)} · ${escapeHtml(s.concert_name)}</li>`
        )
        .join("");
      encoreBlock = `
        <p class="ff-lead"><strong>${escapeHtml(f.encoreKing.song.title)}</strong> · 安可 ${f.encoreKing.times} 次</p>
        <p class="ff-note">出現於以下演唱會場次：</p>
        <ul class="ff-session-list">${sessList}</ul>`;
    }

    const minorList = (f.minorThenMain || []).length
      ? f.minorThenMain
          .map(
            (row) => `<li>
              <span class="ff-main">${escapeHtml(row.song.title)}</span>
              <span class="ff-sub">首次：${escapeHtml(row.first_date)} · ${escapeHtml(row.first_concert)}</span>
            </li>`
          )
          .join("")
      : `<li class="ff-empty">暫無符合條件的歌曲。</li>`;

    root.innerHTML = `
      <section class="ff-section">
        <h2>演唱會場次</h2>
        <p class="ff-lead">截至 <strong>${asOfText}</strong>，千嬅已經開了 <strong>${f.totalShows}</strong> 場演唱會，其中 <strong>${f.personalShows}</strong> 場為個人演唱會。</p>
      </section>

      <section class="ff-section">
        <h2>目前演唱歌曲數記錄最高是</h2>
        <ol class="ff-list">
          ${topShows || `<li class="ff-empty">暫無資料。</li>`}
        </ol>
      </section>

      <section class="ff-section">
        <h2>Top 10 演唱會曲目</h2>
        <p class="ff-note">哪 10 首歌演唱會唱最多次（含 Encore）</p>
        <ol class="ff-list">
          ${topSongs || `<li class="ff-empty">暫無資料。</li>`}
        </ol>
      </section>

      <section class="ff-section">
        <h2>Top 5 演唱會城市</h2>
        <p class="ff-note">哪 5 個城市開的次數最多</p>
        <ol class="ff-list">
          ${topCities || `<li class="ff-empty">暫無資料。</li>`}
        </ol>
      </section>

      <section class="ff-section">
        <h2>Encore 之王</h2>
        <p class="ff-note">哪首歌安可最多次？分別是哪些演唱會場次</p>
        ${encoreBlock}
      </section>

      <section class="ff-section">
        <h2>從 Minor 走進主 Rundown</h2>
        <p class="ff-note">哪些歌開始是 Minor（B minor 或 Minor Classics），後來變成主 rundown</p>
        <ul class="ff-list">${minorList}</ul>
      </section>
    `;
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="ff-section">
      <h2>無法載入 Fun Facts</h2>
      <p class="ff-lead">${escapeHtml(err.message || String(err))}</p>
      <p class="ff-note">請用本地伺服器開啟（不要直接用 file://），例如：<code>python3 -m http.server</code>，然後訪問 <code>http://localhost:8000/funfacts.html</code>。</p>
    </div>`;
  }
})();
