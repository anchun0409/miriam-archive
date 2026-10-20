(async function () {
  const grid = document.getElementById("song-grid");
  const searchInput = document.getElementById("search-input");
  const resultCount = document.getElementById("result-count");
  const songControls = document.getElementById("song-controls");
  const sortSelect = document.getElementById("song-sort");
  const yearFromInput = document.getElementById("year-from");
  const yearToInput = document.getElementById("year-to");
  const yearRangeValue = document.getElementById("year-range-value");
  const yearRangeFill = document.getElementById("year-range-fill");
  const modal = document.getElementById("setlist-modal");
  const modalTitle = document.getElementById("setlist-modal-title");
  const modalSub = document.getElementById("setlist-modal-sub");
  const modalSession = document.getElementById("setlist-session-select");
  const modalSessionLabel = document.querySelector('label[for="setlist-session-select"]');
  const modalList = document.getElementById("setlist-modal-list");

  await DataLayer.load();

  let liveFilter = "all"; // all | performed | never
  let songSort = "shows-desc"; // shows-desc | shows-asc

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

  let yearFrom = yearBounds.min;
  let yearTo = yearBounds.max;

  if (yearFromInput && yearToInput) {
    [yearFromInput, yearToInput].forEach((el) => {
      el.min = String(yearBounds.min);
      el.max = String(yearBounds.max);
      el.step = "1";
    });
    yearFromInput.value = String(yearFrom);
    yearToInput.value = String(yearTo);
  }

  function shortDate(dateStr) {
    const [, m, d] = dateStr.split("-");
    return `${m}/${d}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Parenthetical performance label, e.g. （清唱一小段） / （ft.側田） */
  function perfLabelHTML(notes) {
    const n = (notes || "").trim();
    if (!n) return "";
    return `<span class="perf-label">（${escapeHtml(n)}）</span>`;
  }

  function originalTagHTML(song) {
    if (!DataLayer.isOtherArtist(song)) return "";
    const name = DataLayer.originalArtist(song);
    if (!name) return '<span class="tag-other">原唱：未知</span>';
    return `<span class="tag-other">原唱：${escapeHtml(name)}</span>`;
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

  function isYearFilterActive() {
    return yearFrom > yearBounds.min || yearTo < yearBounds.max;
  }

  function lastSungYear(songId) {
    const d = DataLayer.mostRecentDateFor(songId);
    return d ? Number(d.slice(0, 4)) : null;
  }

  function syncYearRangeUI() {
    if (!yearFromInput || !yearToInput) return;
    yearFromInput.value = String(yearFrom);
    yearToInput.value = String(yearTo);
    if (yearRangeValue) {
      yearRangeValue.textContent = `${yearFrom}–${yearTo}`;
    }
    if (yearRangeFill) {
      const span = yearBounds.max - yearBounds.min || 1;
      const left = ((yearFrom - yearBounds.min) / span) * 100;
      const right = ((yearTo - yearBounds.min) / span) * 100;
      yearRangeFill.style.left = `${left}%`;
      yearRangeFill.style.width = `${Math.max(0, right - left)}%`;
    }
    // Keep the active thumb on top so overlapping ends stay draggable
    yearFromInput.style.zIndex = yearFrom > yearBounds.min + (yearTo - yearFrom) / 2 ? "3" : "2";
    yearToInput.style.zIndex = "2";
    if (yearTo <= yearFrom) yearToInput.style.zIndex = "3";
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
        <div class="song-title">
          ${song.title}${
            song.language === "國語"
              ? '<span class="song-lang">國語</span>'
              : ""
          }
        </div>
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

    const yearActive = liveFilter !== "never" && isYearFilterActive();
    if (yearActive) {
      songs = songs.filter((s) => {
        const y = lastSungYear(s.song_id);
        return y != null && y >= yearFrom && y <= yearTo;
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
    } else if (yearActive) {
      resultCount.textContent = `共 ${songs.length} 首（最近演唱 ${yearFrom}–${yearTo}）`;
    } else if (liveFilter === "performed") {
      resultCount.textContent = `共 ${songs.length} 首已有演唱會Live版`;
    } else {
      resultCount.textContent = `共 ${songs.length} 首歌曲（其中 ${neverCount} 首尚未有演唱會Live版）`;
    }

    syncYearRangeUI();
    syncSongControlsVisibility();

    if (!songs.length) {
      let emptyHint = "請試試其他搜尋關鍵字。";
      if (liveFilter === "never") emptyHint = "目前沒有符合的尚未有Live版歌曲。";
      else if (yearActive) emptyHint = `沒有最近演唱落在 ${yearFrom}–${yearTo} 的歌曲。`;
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="big">找不到歌曲</div>
        <div>${emptyHint}</div>
      </div>`;
      return;
    }

    grid.innerHTML = songs.map(songCardHTML).join("");
  }

  function setSessionControlsVisible(visible) {
    modalSession.style.display = visible ? "block" : "none";
    if (modalSessionLabel) modalSessionLabel.style.display = visible ? "block" : "none";
  }

  function renderSetlist(sessionId, highlightSongId) {
    const items = DataLayer.setlistForSession(sessionId);
    if (!items.length) {
      modalList.innerHTML = `<div class="history-empty">此場次暫無歌單資料。</div>`;
      return;
    }

    const main = [];
    const encore = [];
    items.forEach((p, i) => {
      const row = { p, i };
      if (p.is_main_rundown === false) encore.push(row);
      else main.push(row);
    });

    const rowHTML = ({ p, i }) => {
      const title = p.song?.title || p.song_id;
      const other = originalTagHTML(p.song);
      const label = perfLabelHTML(p.notes);
      const highlight =
        highlightSongId && p.song_id === highlightSongId ? " highlight" : "";
      return `<div class="setlist-item${highlight}">
        <span class="setlist-num">${i + 1}</span>
        <span class="setlist-title">${escapeHtml(title)}${label}${other}</span>
      </div>`;
    };

    let html = main.map(rowHTML).join("");
    if (encore.length) {
      html += `<div class="setlist-encore-head">Encore</div>`;
      html += encore.map(rowHTML).join("");
    }
    modalList.innerHTML = html;
  }

  function openSetlistModal(concertId, highlightSongId, preferredSessionId) {
    const concert = DataLayer.getConcert(concertId);
    if (!concert) return;

    const sessions = DataLayer.sessionsForConcert(concertId);
    modal.dataset.mode = "setlist";
    modalTitle.textContent = concert.concert_name;
    modalSub.textContent = concert.concert_name_english || "";

    modalSession.innerHTML = sessions
      .map((s) => {
        const loc = DataLayer.formatLocation(s);
        return `<option value="${s.session_id}">${s.date} · ${loc}</option>`;
      })
      .join("");

    setSessionControlsVisible(sessions.length > 1);
    modal.dataset.highlightSong = highlightSongId || "";
    modal.classList.add("open");
    document.body.classList.add("modal-open");

    const preferred =
      preferredSessionId && sessions.some((s) => s.session_id === preferredSessionId)
        ? preferredSessionId
        : sessions[0]?.session_id;
    if (preferred) {
      modalSession.value = preferred;
      renderSetlist(preferred, highlightSongId);
    }
  }

  function openAlbumModal(albumName) {
    const songs = DataLayer.songsInAlbum(albumName);
    modal.dataset.mode = "album";
    modalTitle.textContent = albumName;
    modalSub.textContent = `專輯曲目 · 共 ${songs.length} 首`;
    setSessionControlsVisible(false);

    if (!songs.length) {
      modalList.innerHTML = `<div class="history-empty">此專輯暫無歌曲資料。</div>`;
    } else {
      const sorted = [...songs].sort((a, b) => {
        const ya = a.release_year || 0;
        const yb = b.release_year || 0;
        if (ya !== yb) return ya - yb;
        return a.title.localeCompare(b.title, "zh-Hant");
      });
      modalList.innerHTML = sorted
        .map((s, i) => {
          const other = s.is_other_artist;
          const never = !other && !DataLayer.hasBeenPerformed(s.song_id);
          const tags = [
            other ? originalTagHTML(s) : "",
            never ? '<span class="tag-never">尚未有Live版</span>' : "",
          ].join("");
          if (other) {
            return `<div class="setlist-item album-song-row other-artist">
              <span class="setlist-num">${i + 1}</span>
              <span class="setlist-title">${s.title}${tags}</span>
            </div>`;
          }
          return `<button type="button" class="setlist-item album-song-row" data-jump-song="${s.song_id}">
            <span class="setlist-num">${i + 1}</span>
            <span class="setlist-title">${s.title}${tags}</span>
          </button>`;
        })
        .join("");
    }

    modal.classList.add("open");
    document.body.classList.add("modal-open");
  }

  function closeSetlistModal() {
    modal.classList.remove("open");
    document.body.classList.remove("modal-open");
  }

  function jumpToSong(songId) {
    closeSetlistModal();
    const card = grid.querySelector(`[data-song-id="${songId}"]`);
    if (!card) {
      const song = DataLayer.getSong(songId);
      if (song) {
        searchInput.value = song.title;
        render(song.title);
        requestAnimationFrame(() => {
          const el = grid.querySelector(`[data-song-id="${songId}"]`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("flash");
            setTimeout(() => el.classList.remove("flash"), 1200);
          }
        });
      }
      return;
    }
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 1200);
  }

  grid.addEventListener("click", (e) => {
    const albumBtn = e.target.closest("[data-album]");
    if (albumBtn) {
      openAlbumModal(albumBtn.getAttribute("data-album"));
      return;
    }

    const concertBtn = e.target.closest("[data-concert]");
    if (concertBtn) {
      const concertId = concertBtn.getAttribute("data-concert");
      const card = concertBtn.closest("[data-song-id]");
      const songId = card?.getAttribute("data-song-id") || "";
      openSetlistModal(concertId, songId);
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

  modalSession.addEventListener("change", () => {
    if (modal.dataset.mode !== "setlist") return;
    renderSetlist(modalSession.value, modal.dataset.highlightSong || "");
  });

  modal.addEventListener("click", (e) => {
    const jump = e.target.closest("[data-jump-song]");
    if (jump) {
      jumpToSong(jump.getAttribute("data-jump-song"));
      return;
    }
    if (e.target.closest("[data-close-modal]") || e.target === modal) {
      closeSetlistModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) {
      closeSetlistModal();
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

  function onYearFromInput() {
    yearFrom = Number(yearFromInput.value);
    if (yearFrom > yearTo) {
      yearTo = yearFrom;
      yearToInput.value = String(yearTo);
    }
    render(searchInput.value);
  }

  function onYearToInput() {
    yearTo = Number(yearToInput.value);
    if (yearTo < yearFrom) {
      yearFrom = yearTo;
      yearFromInput.value = String(yearFrom);
    }
    render(searchInput.value);
  }

  yearFromInput?.addEventListener("input", onYearFromInput);
  yearToInput?.addEventListener("input", onYearToInput);

  render("");

  // Deep links from Fun Facts: ?song=S001 / ?concert=C008&session=C008-1
  const params = new URLSearchParams(location.search);
  const deepSong = params.get("song");
  const deepConcert = params.get("concert");
  const deepSession = params.get("session");

  if (deepSong) {
    // Ensure the song is visible (clear never-only filter if needed)
    if (liveFilter === "never" && DataLayer.hasBeenPerformed(deepSong)) {
      liveFilter = "all";
      document.querySelectorAll(".filter-pill").forEach((el) => {
        el.classList.toggle("active", el.getAttribute("data-live-filter") === "all");
      });
      render("");
    }
    jumpToSong(deepSong);
    if (deepConcert) {
      setTimeout(() => openSetlistModal(deepConcert, deepSong, deepSession || ""), 350);
    }
  } else if (deepConcert) {
    openSetlistModal(deepConcert, "", deepSession || "");
  }
})();
