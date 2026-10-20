(async function () {
  const grid = document.getElementById("song-grid");
  const searchInput = document.getElementById("search-input");
  const resultCount = document.getElementById("result-count");
  const songControls = document.getElementById("song-controls");
  const sortSelect = document.getElementById("song-sort");
  const silentSinceInput = document.getElementById("silent-since-year");
  const silentSinceText = document.getElementById("silent-since-text");

  await DataLayer.load();

  let liveFilter = "all"; // all | performed | never
  let songSort = "shows-desc"; // shows-desc | shows-asc

  // Slider: drag left → songs last sung in/before that year (not after).
  // Max position = no filter.
  const yearBounds = (() => {
    let min = Infinity;
    let max = -Infinity;
    DataLayer.ownSongs().forEach((s) => {
      const d = DataLayer.mostRecentDateFor(s.song_id);
      if (!d) return;
      const y = Number(d.slice(0, 4));
      if (y < min) min = y;
      if (y > max) max = y;
    });
    const nowY = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" })
    ).getFullYear();
    if (!Number.isFinite(min)) min = 2000;
    if (!Number.isFinite(max)) max = nowY;
    if (max < nowY) max = nowY;
    return { min, max };
  })();

  let silentSinceYear = yearBounds.max;

  if (silentSinceInput) {
    silentSinceInput.min = String(yearBounds.min);
    silentSinceInput.max = String(yearBounds.max);
    silentSinceInput.step = "1";
    silentSinceInput.value = String(silentSinceYear);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shortDate(dateStr) {
    const [, m, d] = dateStr.split("-");
    return `${m}/${d}`;
  }

  function ticketHTML(entry) {
    const keys = entry.sessions.map((s) => DataLayer.locationKey(s));
    const sharedLoc =
      keys.length > 0 && keys.every((k) => k === keys[0])
        ? DataLayer.formatLocation(entry.sessions[0])
        : null;

    const byYear = {};
    entry.sessions.forEach((s) => {
      const y = s.date.slice(0, 4);
      if (!byYear[y]) byYear[y] = [];
      byYear[y].push(s);
    });

    const yearBlocks = Object.keys(byYear)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((year) => {
        const items = byYear[year]
          .map((s) => {
            const loc = sharedLoc ? "" : ` ${DataLayer.formatLocation(s)}`;
            return `<span class="ticket-chip"><span class="date">${shortDate(s.date)}</span>${loc}</span>`;
          })
          .join("");
        return `<div class="ticket-year-block">
          <div class="ticket-year">${year}</div>
          <div class="ticket-chips">${items}</div>
        </div>`;
      })
      .join("");

    const sharedLocHTML = sharedLoc
      ? `<div class="ticket-shared-loc">${sharedLoc}</div>`
      : "";

    return `<div class="ticket">
      <button type="button" class="ticket-tour" data-concert="${entry.concert_id}">${entry.concert_name}</button>
      ${sharedLocHTML}
      <div class="ticket-sessions">${yearBlocks}</div>
    </div>`;
  }

  function songMetaHTML(song) {
    const parts = DataLayer.albumParts(song.album);
    const year = song.release_year || "";
    const albumBtns = parts
      .map(
        (name) =>
          `<button type="button" class="meta-album-name" data-album="${name.replace(/"/g, "&quot;")}">${name}</button>`
      )
      .join('<span class="meta-album-sep">、</span>');

    const albumYear =
      parts.length || year
        ? `<div class="meta-row meta-album">
            ${albumBtns}
            ${year ? `<span class="meta-year">${year}</span>` : ""}
          </div>`
        : "";

    const credits = [
      song.lyricist ? `詞 ${song.lyricist}` : "",
      song.composer ? `曲 ${song.composer}` : "",
      song.arranger ? `編 ${song.arranger}` : "",
    ].filter(Boolean);

    const creditsRow = credits.length
      ? `<div class="meta-row meta-credits">${credits.join(" · ")}</div>`
      : "";

    return `<div class="song-meta">${albumYear}${creditsRow}</div>`;
  }

  function isSilentSinceActive() {
    return silentSinceYear < yearBounds.max;
  }

  function lastSungYear(songId) {
    const d = DataLayer.mostRecentDateFor(songId);
    return d ? Number(d.slice(0, 4)) : null;
  }

  function syncSilentSinceUI() {
    if (silentSinceInput) {
      silentSinceInput.value = String(silentSinceYear);
      const span = yearBounds.max - yearBounds.min || 1;
      const pct = ((silentSinceYear - yearBounds.min) / span) * 100;
      silentSinceInput.style.setProperty("--silent-pct", `${pct}%`);
      silentSinceInput.setAttribute(
        "aria-valuetext",
        isSilentSinceActive()
          ? `自 ${silentSinceYear} 年後未唱過`
          : "不限年份"
      );
    }
    if (silentSinceText) {
      silentSinceText.textContent = isSilentSinceActive()
        ? `≤${silentSinceYear}`
        : "不限";
    }
  }

  function syncSongControlsVisibility() {
    if (!songControls) return;
    songControls.hidden = !(liveFilter === "all" || liveFilter === "performed");
  }

  function songCardHTML(song) {
    const history = DataLayer.performanceHistoryFor(song.song_id);
    const { shows, times } = DataLayer.performanceCountsFor(song.song_id);
    const never = times === 0;
    const lastDate = history[0]?.latest_date || null;

    const historyHTML = history.length
      ? history.map(ticketHTML).join("")
      : `<div class="history-empty">尚無現場演出紀錄。</div>`;

    const historyLabel = never
      ? "演出紀錄（尚未有Live版）"
      : `演出紀錄（${shows} 場演唱會／巡演，共 ${times} 次）`;

    return `
    <div class="song-card${never ? " never-performed" : ""}" data-song-id="${song.song_id}">
      <div class="song-card-top">
        <button type="button" class="song-title" data-select-song="${song.song_id}">
          ${escapeHtml(song.title)}${
            song.language === "國語"
              ? '<span class="song-lang">國語</span>'
              : ""
          }
        </button>
      </div>
      ${songMetaHTML(song)}
      ${
        never
          ? liveFilter === "never"
            ? ""
            : `<div class="never-badge">尚未有演唱會Live版</div>`
          : `<div class="last-performed">🎤 最近演唱：${DataLayer.timeSince(lastDate)}</div>`
      }
      <button class="history-toggle" data-toggle="${song.song_id}">
        <span>${historyLabel}</span>
        <span class="chev">▾</span>
      </button>
      <div class="history-list" id="history-${song.song_id}">${historyHTML}</div>
    </div>`;
  }

  function render(filterText) {
    const q = (filterText || "").trim().toLowerCase();
    let songs = DataLayer.ownSongs().filter((s) => !q || s.title.toLowerCase().includes(q));

    if (liveFilter === "performed") {
      songs = songs.filter((s) => DataLayer.hasBeenPerformed(s.song_id));
    } else if (liveFilter === "never") {
      songs = songs.filter((s) => !DataLayer.hasBeenPerformed(s.song_id));
    }

    const silentActive = liveFilter !== "never" && isSilentSinceActive();
    if (silentActive) {
      songs = songs.filter((s) => {
        const y = lastSungYear(s.song_id);
        return y != null && y <= silentSinceYear;
      });
    }

    songs.sort((a, b) => {
      if (liveFilter === "never") {
        const ya = a.release_year || 9999;
        const yb = b.release_year || 9999;
        if (ya !== yb) return ya - yb;
        return (a.title || "").localeCompare(b.title || "", "zh-Hant");
      }

      const ta = DataLayer.performanceCountsFor(a.song_id).times;
      const tb = DataLayer.performanceCountsFor(b.song_id).times;
      if (ta !== tb) {
        return songSort === "shows-asc" ? ta - tb : tb - ta;
      }
      const da = DataLayer.mostRecentDateFor(a.song_id) || "0000-00-00";
      const db = DataLayer.mostRecentDateFor(b.song_id) || "0000-00-00";
      if (da !== db) return da < db ? 1 : -1;
      return (a.title || "").localeCompare(b.title || "", "zh-Hant");
    });

    const neverCount = DataLayer.ownSongs().filter(
      (s) => (!q || s.title.toLowerCase().includes(q)) && !DataLayer.hasBeenPerformed(s.song_id)
    ).length;

    if (liveFilter === "never") {
      resultCount.textContent = `共 ${songs.length} 首尚未有演唱會Live版`;
    } else if (silentActive) {
      resultCount.textContent = `共 ${songs.length} 首自 ${silentSinceYear} 年後未唱過`;
    } else if (liveFilter === "performed") {
      resultCount.textContent = `共 ${songs.length} 首已有演唱會Live版`;
    } else {
      resultCount.textContent = `共 ${songs.length} 首歌曲（其中 ${neverCount} 首尚未有演唱會Live版）`;
    }

    syncSilentSinceUI();
    syncSongControlsVisibility();

    if (!songs.length) {
      let emptyHint = "請試試其他搜尋關鍵字。";
      if (liveFilter === "never") emptyHint = "目前沒有符合的尚未有Live版歌曲。";
      else if (silentActive) emptyHint = `沒有自 ${silentSinceYear} 年後未唱過的歌曲。`;
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="big">找不到歌曲</div>
        <div>${emptyHint}</div>
      </div>`;
      return;
    }

    grid.innerHTML = songs.map(songCardHTML).join("");
  }

  function flashSong(songId) {
    const card = grid.querySelector(`[data-song-id="${songId}"]`);
    if (!card) return false;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 1200);
    return true;
  }

  function jumpToSong(songId, { updateUrl = true } = {}) {
    Overlay.close({ updateUrl: false });
    if (liveFilter === "never" && DataLayer.hasBeenPerformed(songId)) {
      liveFilter = "all";
      document.querySelectorAll(".filter-pill").forEach((el) => {
        el.classList.toggle("active", el.getAttribute("data-live-filter") === "all");
      });
    }

    let card = grid.querySelector(`[data-song-id="${songId}"]`);
    if (!card) {
      const song = DataLayer.getSong(songId);
      if (song) {
        searchInput.value = "";
        // Clear silence filter if it hides the song
        const y = lastSungYear(songId);
        if (y != null && isSilentSinceActive() && y > silentSinceYear) {
          silentSinceYear = yearBounds.max;
        }
        render("");
      }
    }

    requestAnimationFrame(() => {
      if (!flashSong(songId)) {
        const song = DataLayer.getSong(songId);
        if (song) {
          searchInput.value = song.title;
          render(song.title);
          requestAnimationFrame(() => flashSong(songId));
        }
      }
    });

    if (updateUrl) Overlay.pushSongUrl(songId);
  }

  Overlay.init({
    syncUrl: true,
    onJumpSong: (id) => jumpToSong(id, { updateUrl: true }),
  });

  grid.addEventListener("click", (e) => {
    const selectSong = e.target.closest("[data-select-song]");
    if (selectSong) {
      jumpToSong(selectSong.getAttribute("data-select-song"), { updateUrl: true });
      return;
    }

    const albumBtn = e.target.closest("[data-album]");
    if (albumBtn) {
      Overlay.openAlbum(albumBtn.getAttribute("data-album"));
      return;
    }

    const concertBtn = e.target.closest("[data-concert]");
    if (concertBtn) {
      const concertId = concertBtn.getAttribute("data-concert");
      const card = concertBtn.closest("[data-song-id]");
      const songId = card?.getAttribute("data-song-id") || "";
      Overlay.openSetlist(concertId, songId);
      return;
    }

    const toggleBtn = e.target.closest("[data-toggle]");
    if (toggleBtn) {
      const id = toggleBtn.getAttribute("data-toggle");
      const list = document.getElementById(`history-${id}`);
      list.classList.toggle("open");
      toggleBtn.classList.toggle("open");
    }
  });

  searchInput.addEventListener("input", () => render(searchInput.value));

  document.querySelector(".filter-pills")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-live-filter]");
    if (!btn) return;
    liveFilter = btn.getAttribute("data-live-filter") || "all";
    document.querySelectorAll(".filter-pill").forEach((el) => {
      el.classList.toggle("active", el === btn);
    });
    render(searchInput.value);
  });

  sortSelect?.addEventListener("change", () => {
    songSort = sortSelect.value || "shows-desc";
    render(searchInput.value);
  });

  function onSilentSinceInput() {
    silentSinceYear = Number(silentSinceInput.value);
    if (!Number.isFinite(silentSinceYear)) silentSinceYear = yearBounds.max;
    syncSilentSinceUI();
    render(searchInput.value);
  }

  silentSinceInput?.addEventListener("input", onSilentSinceInput);
  silentSinceInput?.addEventListener("change", onSilentSinceInput);

  function applyDeepLink() {
    const params = new URLSearchParams(location.search);
    const deepSong = params.get("song");
    const deepConcert = params.get("concert");
    const deepSession = params.get("session");
    const deepAlbum = params.get("album");

    if (deepAlbum) {
      Overlay.openAlbum(deepAlbum, { push: false });
      return;
    }

    if (deepSong) {
      jumpToSong(deepSong, { updateUrl: false });
      if (deepConcert) {
        setTimeout(
          () => Overlay.openSetlist(deepConcert, deepSong, deepSession || "", { push: false }),
          350
        );
      }
      return;
    }

    if (deepConcert) {
      Overlay.openSetlist(deepConcert, "", deepSession || "", { push: false });
    }
  }

  window.addEventListener("popstate", () => {
    Overlay.close({ updateUrl: false });
    applyDeepLink();
  });

  render("");
  applyDeepLink();
})();
