(async function () {
  const root = document.getElementById("concerts-root");
  if (!root) return;

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  try {
    const DL = window.DataLayer;
    if (!DL || typeof DL.load !== "function") {
      throw new Error("DataLayer 未載入，請確認 js/data.js 路徑正確。");
    }
    await DL.load();
    Overlay.init({ syncUrl: false });

    const themes =
      typeof DL.themeConcerts === "function"
        ? DL.themeConcerts()
        : DL.funFacts().themeConcerts || [];

    if (!themes.length) {
      root.innerHTML = `<p class="ff-empty">暫無主題演唱會／巡演資料。</p>`;
      return;
    }

    root.innerHTML = `
      <p class="ff-lead">共 <strong>${themes.length}</strong> 個主題演唱會／巡演。</p>
      <ol class="ff-list concert-coverage-list">
        ${themes
          .map((row, i) => {
            const c = row.concert;
            const range =
              row.first_date && row.last_date
                ? row.first_date === row.last_date
                  ? row.first_date
                  : `${row.first_date} – ${row.last_date}`
                : "";
            const place = row.cities.length
              ? row.cities.join("、")
              : row.countries.join("、");
            return `<li>
              <span class="ff-rank">${i + 1}.</span>
              <div class="ff-item-body">
                <button type="button" class="ff-link ff-main" data-open-concert="${c.concert_id}">${escapeHtml(c.concert_name)}</button>
                <div class="ff-sub">${row.session_count} 場${range ? ` · ${escapeHtml(range)}` : ""}${place ? ` · ${escapeHtml(place)}` : ""}</div>
              </div>
            </li>`;
          })
          .join("")}
      </ol>`;

    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-open-concert]");
      if (!btn) return;
      Overlay.openSetlist(btn.getAttribute("data-open-concert"), "", "", {
        push: false,
      });
    });
  } catch (err) {
    console.error(err);
    root.innerHTML = `<p class="ff-lead">${escapeHtml(err.message || String(err))}</p>`;
  }
})();
