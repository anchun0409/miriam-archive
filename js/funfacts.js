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

  async function asOfMonth() {
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

  function formatAsOfZh(ym) {
    const [y, m] = String(ym).split("-");
    if (!y || !m) return ym;
    return `${y} 年 ${Number(m)} 月`;
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

    Overlay.init({ syncUrl: false });

    const f = DL.funFacts();
    const asOfText = await asOfMonth();
    const asOfZh = formatAsOfZh(asOfText);

    const topShows = (f.topSongCountShows || [])
      .map((row, i) => {
        const c = row.concert;
        const s = row.session;
        return `<li>
          <span class="ff-rank">Top ${i + 1}</span>
          <div class="ff-item-body">
            <button type="button" class="ff-link ff-main" data-open-concert="${c.concert_id}" data-open-session="${s.session_id}">${DL.concertNameHTML(c)}</button>
            <div class="ff-sub">（${escapeHtml(s.city)} ${escapeHtml(s.date)}）· ${row.count} 首</div>
          </div>
        </li>`;
      })
      .join("");

    const topSongs = (f.topSongs || [])
      .map(
        (row, i) => `<li>
          <span class="ff-rank">${i + 1}.</span>
          <button type="button" class="ff-link ff-main" data-open-song="${row.song.song_id}">${escapeHtml(row.song.title)}</button>
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
          <button type="button" class="ff-link ff-main" data-open-song="${row.song.song_id}">${escapeHtml(row.song.title)}</button>
          <span class="ff-sub">安可 ${row.times} 次</span>
        </li>`
      )
      .join("");

    function minorSongLi(row) {
      return `<li>
        <button type="button" class="ff-link ff-main" data-open-song="${row.song.song_id}">${escapeHtml(row.song.title)}</button>
        <span class="ff-sub">${escapeHtml(row.first_date)}</span>
      </li>`;
    }

    const minorRows = f.minorThenMain || [];
    const minorClassics = minorRows.filter((row) =>
      /Minor Classics/i.test(row.first_concert || "")
    );
    const bMinor = minorRows.filter((row) => /B minor/i.test(row.first_concert || ""));
    const minorOther = minorRows.filter(
      (row) =>
        !/Minor Classics/i.test(row.first_concert || "") &&
        !/B minor/i.test(row.first_concert || "")
    );

    const minorSection = minorRows.length
      ? [
          minorClassics.length
            ? `<h3 class="ff-subhead">Minor Classics</h3>
               <ul class="ff-list">${minorClassics.map(minorSongLi).join("")}</ul>`
            : "",
          bMinor.length
            ? `<h3 class="ff-subhead">B minor</h3>
               <ul class="ff-list">${bMinor.map(minorSongLi).join("")}</ul>`
            : "",
          minorOther.length
            ? `<h3 class="ff-subhead">其他</h3>
               <ul class="ff-list">${minorOther.map(minorSongLi).join("")}</ul>`
            : "",
        ].join("")
      : `<p class="ff-empty">暫無符合條件的歌曲。</p>`;

    root.innerHTML = `
      <section class="ff-section">
        <h2>演唱會足跡</h2>
        <p class="ff-lead">截至 <strong>${asOfZh}</strong>，千嬅已舉行 <a class="ff-link" href="concerts.html"><strong>${f.themeConcertCount}</strong> 個主題演唱會／巡演</a>，共計 <strong>${f.totalShows}</strong> 場演出，其中 <strong>${f.personalShows}</strong> 場為個人演唱會；足跡遍及 <strong>${f.countryCount}</strong> 個國家及地區、<strong>${f.cityCount}</strong> 座城市。</p>
      </section>

      <section class="ff-section">
        <h2>單場演唱歌曲數 Top 5</h2>
        <p class="ff-note">哪幾場演唱會唱最多首歌（含encore）</p>
        <ol class="ff-list ff-list-stacked">
          ${topShows || `<li class="ff-empty">暫無資料。</li>`}
        </ol>
      </section>

      <section class="ff-section">
        <h2>演唱會曲目 Top 10</h2>
        <p class="ff-note">哪些歌被唱得最多</p>
        <ol class="ff-list">
          ${topSongs || `<li class="ff-empty">暫無資料。</li>`}
        </ol>
      </section>

      <section class="ff-section">
        <h2>演唱會城市 Top 5</h2>
        <p class="ff-note">哪些城市開的次數最多</p>
        <ol class="ff-list">
          ${topCities || `<li class="ff-empty">暫無資料。</li>`}
        </ol>
      </section>

      <section class="ff-section">
        <h2>Encore 之王</h2>
        <p class="ff-note">哪些歌安可次數最多</p>
        <ol class="ff-list">
          ${encoreTop || `<li class="ff-empty">暫無資料。</li>`}
        </ol>
      </section>

      <section class="ff-section">
        <h2>從 Minor 走進主 Rundown</h2>
        <p class="ff-note">哪些曾經的「冷門歌」被唱「熱」了</p>
        ${minorSection}
      </section>
    `;

    root.addEventListener("click", (e) => {
      const songBtn = e.target.closest("[data-open-song]");
      if (songBtn) {
        Overlay.openSong(songBtn.getAttribute("data-open-song"), { push: false });
        return;
      }
      const concertBtn = e.target.closest("[data-open-concert]");
      if (concertBtn) {
        Overlay.openSetlist(
          concertBtn.getAttribute("data-open-concert"),
          "",
          concertBtn.getAttribute("data-open-session") || "",
          { push: false }
        );
      }
    });
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="ff-section">
      <h2>無法載入 Fun Facts</h2>
      <p class="ff-lead">${escapeHtml(err.message || String(err))}</p>
      <p class="ff-note">請用本地伺服器開啟（不要直接用 file://），例如：<code>python3 -m http.server</code>，然後訪問 <code>http://localhost:8000/funfacts.html</code>。</p>
    </div>`;
  }
})();
