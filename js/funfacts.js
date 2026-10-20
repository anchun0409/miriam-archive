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

  function songHref(songId) {
    return `index.html?song=${encodeURIComponent(songId)}`;
  }

  function concertHref(concertId, sessionId) {
    let url = `index.html?concert=${encodeURIComponent(concertId)}`;
    if (sessionId) url += `&session=${encodeURIComponent(sessionId)}`;
    return url;
  }

  async function asOfMonth() {
    // Prefer stamped last-updated month; fall back to current calendar month (HK).
    try {
      const res = await fetch("data/last-updated.json", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const date = data.date || (data.updated_at || "").slice(0, 10);
        if (date && /^\d{4}-\d{2}/.test(date)) return date.slice(0, 7);
      }
    } catch (_) {}
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" })
    );
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  try {
    const DL = window.DataLayer;
    if (!DL || typeof DL.load !== "function") {
      throw new Error("DataLayer 未載入，請確認 js/data.js 路徑正確。");
    }

    await DL.load();

    if (typeof DL.funFacts !== "function") {
      throw new Error("DataLayer.funFacts 不存在，請重新整理或更新 js/data.js。");
    }

    const f = DL.funFacts();
    const asOfText = await asOfMonth();

    const topShows = (f.topSongCountShows || [])
      .map((row, i) => {
        const c = row.concert;
        const s = row.session;
        return `<li>
          <span class="ff-rank">Top ${i + 1}</span>
          <a class="ff-link ff-main" href="${concertHref(c.concert_id, s.session_id)}">${escapeHtml(c.concert_name)}</a>
          <span class="ff-sub">（${escapeHtml(s.city)} ${escapeHtml(s.date)}）· ${row.count} 首</span>
        </li>`;
      })
      .join("");

    const topSongs = (f.topSongs || [])
      .map(
        (row, i) => `<li>
          <span class="ff-rank">${i + 1}.</span>
          <a class="ff-link ff-main" href="${songHref(row.song.song_id)}">${escapeHtml(row.song.title)}</a>
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

    const encoreTop = (f.encoreTop || [])
      .map(
        (row, i) => `<li>
          <span class="ff-rank">Top ${i + 1}</span>
          <a class="ff-link ff-main" href="${songHref(row.song.song_id)}">${escapeHtml(row.song.title)}</a>
          <span class="ff-sub">安可 ${row.times} 次</span>
        </li>`
      )
      .join("");

    const minorList = (f.minorThenMain || []).length
      ? f.minorThenMain
          .map(
            (row) => `<li>
              <a class="ff-link ff-main" href="${songHref(row.song.song_id)}">${escapeHtml(row.song.title)}</a>
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
        <p class="ff-note">安可次數 Top 5（點歌名可查看歌曲卡）</p>
        <ol class="ff-list">
          ${encoreTop || `<li class="ff-empty">暫無資料。</li>`}
        </ol>
      </section>

      <section class="ff-section">
        <h2>從 Minor 走進主 Rundown</h2>
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
