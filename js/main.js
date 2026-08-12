(async function () {
  const grid = document.getElementById("song-grid");
  const searchInput = document.getElementById("search-input");
  const resultCount = document.getElementById("result-count");
  const modal = document.getElementById("setlist-modal");
  const modalTitle = document.getElementById("setlist-modal-title");
  const modalSub = document.getElementById("setlist-modal-sub");
  const modalSession = document.getElementById("setlist-session-select");
  const modalSessionLabel = document.querySelector('label[for="setlist-session-select"]');
  const modalList = document.getElementById("setlist-modal-list");

  await DataLayer.load();
  await Likes.loadAll();

  let liveFilter = "all"; // all | performed | never

  const heartIcon = (filled) => `
    <svg viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>
    </svg>`;

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
            const encoreTag =
              s.is_main_rundown === false
                ? '<span class="tag-encore">Encore</span>'
                : "";
            return `<span class="ticket-chip"><span class="date">${shortDate(s.date)}</span>${loc}${encoreTag}</span>`;
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

  function songCardHTML(song) {
    const history = DataLayer.performanceHistoryFor(song.song_id);
    const { shows, times } = DataLayer.performanceCountsFor(song.song_id);
    const never = times === 0;
    const lastDate = history[0]?.latest_date || null;
    const likeCount = Likes.countFor(song.song_id);
    const liked = Likes.hasLiked(song.song_id);

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
        <button class="like-btn ${liked ? "liked" : ""}" data-like="${song.song_id}" aria-label="喜歡">
          ${heartIcon(liked)} <span class="like-count">${likeCount}</span>
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

    songs.sort((a, b) => {
      if (liveFilter === "never") {
        const ya = a.release_year || 0;
        const yb = b.release_year || 0;
        if (yb !== ya) return yb - ya;
        return (a.title || "").localeCompare(b.title || "", "zh-Hant");
      }
      const ta = DataLayer.performanceCountsFor(a.song_id).times;
      const tb = DataLayer.performanceCountsFor(b.song_id).times;
      if (tb !== ta) return tb - ta;
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
    } else if (liveFilter === "performed") {
      resultCount.textContent = `共 ${songs.length} 首已有演唱會Live版`;
    } else {
      resultCount.textContent = `共 ${songs.length} 首歌曲（其中 ${neverCount} 首尚未有演唱會Live版）`;
    }

    if (!songs.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="big">找不到歌曲</div>
        <div>${liveFilter === "never" ? "目前沒有符合的尚未有Live版歌曲。" : "請試試其他搜尋關鍵字。"}</div>
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

    modalList.innerHTML = items
      .map((p, i) => {
        const title = p.song?.title || p.song_id;
        const other = DataLayer.isOtherArtist(p.song)
          ? '<span class="tag-other">其他歌手</span>'
          : "";
        const encore =
          p.is_main_rundown === false
            ? '<span class="tag-encore">Encore</span>'
            : "";
        const note = p.notes ? `<span class="setlist-note">${p.notes}</span>` : "";
        const highlight =
          highlightSongId && p.song_id === highlightSongId ? " highlight" : "";
        return `<div class="setlist-item${highlight}">
          <span class="setlist-num">${i + 1}</span>
          <span class="setlist-title">${title}${other}${encore}${note}</span>
        </div>`;
      })
      .join("");
  }

  function openSetlistModal(concertId, highlightSongId) {
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

    const firstId = sessions[0]?.session_id;
    if (firstId) {
      modalSession.value = firstId;
      renderSetlist(firstId, highlightSongId);
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
            other ? '<span class="tag-other">其他歌手</span>' : "",
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

  grid.addEventListener("click", async (e) => {
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
      return;
    }

    const likeBtn = e.target.closest("[data-like]");
    if (likeBtn) {
      const id = likeBtn.getAttribute("data-like");
      const ok = await Likes.like(id);
      if (ok) {
        likeBtn.classList.add("liked");
        likeBtn.querySelector(".like-count").textContent = Likes.countFor(id);
        likeBtn.querySelector("svg").setAttribute("fill", "currentColor");
      }
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

  render("");
})();
