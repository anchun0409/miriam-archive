// Shared setlist / album / song overlay used by index and Fun Facts.
window.Overlay = (() => {
  let els = null;
  let opts = { syncUrl: false, onJumpSong: null };

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shortDate(dateStr) {
    const [, m, d] = String(dateStr).split("-");
    return `${m}/${d}`;
  }

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

  function setSessionControlsVisible(visible) {
    if (!els) return;
    els.session.style.display = visible ? "block" : "none";
    if (els.sessionLabel) els.sessionLabel.style.display = visible ? "block" : "none";
  }

  function pushUrl(params) {
    if (!opts.syncUrl) return;
    const qs = params.toString();
    const next = qs ? `${location.pathname}?${qs}` : location.pathname;
    const cur = `${location.pathname}${location.search}`;
    if (next !== cur) history.pushState(null, "", next);
  }

  function replaceUrl(params) {
    if (!opts.syncUrl) return;
    const qs = params.toString();
    const next = qs ? `${location.pathname}?${qs}` : location.pathname;
    const cur = `${location.pathname}${location.search}`;
    if (next !== cur) history.replaceState(null, "", next);
  }

  function urlParamsFromState(state) {
    const params = new URLSearchParams();
    if (state.album) {
      params.set("album", state.album);
      return params;
    }
    if (state.song) params.set("song", state.song);
    if (state.concert) params.set("concert", state.concert);
    if (state.session) params.set("session", state.session);
    return params;
  }

  function renderSetlist(sessionId, highlightSongId) {
    const items = DataLayer.setlistForSession(sessionId);
    if (!items.length) {
      els.list.innerHTML = `<div class="history-empty">此場次暫無歌單資料。</div>`;
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
      const songId = p.song_id || "";
      const clickable =
        songId && p.song && !p.song.is_other_artist
          ? ` role="button" tabindex="0" data-jump-song="${songId}"`
          : "";
      return `<div class="setlist-item${highlight}"${clickable}>
        <span class="setlist-num">${i + 1}</span>
        <span class="setlist-title">${escapeHtml(title)}${label}${other}</span>
      </div>`;
    };

    let html = main.map(rowHTML).join("");
    if (encore.length) {
      html += `<div class="setlist-encore-head">Encore</div>`;
      html += encore.map(rowHTML).join("");
    }
    els.list.innerHTML = html;
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
      <button type="button" class="ticket-tour" data-concert="${entry.concert_id}">${escapeHtml(entry.concert_name)}</button>
      ${sharedLocHTML}
      <div class="ticket-sessions">${yearBlocks}</div>
    </div>`;
  }

  function clearAlbumAttr() {
    if (!els) return;
    delete els.root.dataset.album;
    els.root.removeAttribute("data-album");
  }

  function openSetlist(concertId, highlightSongId, preferredSessionId, { push = true } = {}) {
    const concert = DataLayer.getConcert(concertId);
    if (!concert || !els) return;

    const sessions = DataLayer.sessionsForConcert(concertId);
    els.root.dataset.mode = "setlist";
    els.root.dataset.concertId = concertId;
    els.root.dataset.songId = highlightSongId || "";
    clearAlbumAttr();
    els.title.textContent = concert.concert_name;
    els.sub.textContent = concert.concert_name_english || "";

    els.session.innerHTML = sessions
      .map((s) => {
        const loc = DataLayer.formatLocation(s);
        return `<option value="${s.session_id}">${s.date} · ${loc}</option>`;
      })
      .join("");

    setSessionControlsVisible(sessions.length > 1);
    els.root.dataset.highlightSong = highlightSongId || "";
    els.root.classList.add("open");
    document.body.classList.add("modal-open");

    const preferred =
      preferredSessionId && sessions.some((s) => s.session_id === preferredSessionId)
        ? preferredSessionId
        : sessions[0]?.session_id;
    if (preferred) {
      els.session.value = preferred;
      renderSetlist(preferred, highlightSongId);
    }

    if (push) {
      pushUrl(
        urlParamsFromState({
          song: highlightSongId || "",
          concert: concertId,
          session: preferred || "",
        })
      );
    }
  }

  function openAlbum(albumName, { push = true } = {}) {
    if (!els) return;
    const name = (albumName || "").trim();
    if (!name) return;
    const songs = DataLayer.songsInAlbum(name);
    els.root.dataset.mode = "album";
    els.root.dataset.album = name;
    els.root.dataset.concertId = "";
    els.root.dataset.songId = "";
    els.title.textContent = name;
    els.sub.textContent = `專輯曲目 · 共 ${songs.length} 首`;
    setSessionControlsVisible(false);

    if (!songs.length) {
      els.list.innerHTML = `<div class="history-empty">此專輯暫無歌曲資料。</div>`;
    } else {
      const sorted = [...songs].sort((a, b) => {
        const ya = a.release_year || 0;
        const yb = b.release_year || 0;
        if (ya !== yb) return ya - yb;
        return a.title.localeCompare(b.title, "zh-Hant");
      });
      els.list.innerHTML = sorted
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
              <span class="setlist-title">${escapeHtml(s.title)}${tags}</span>
            </div>`;
          }
          return `<button type="button" class="setlist-item album-song-row" data-jump-song="${s.song_id}">
            <span class="setlist-num">${i + 1}</span>
            <span class="setlist-title">${escapeHtml(s.title)}${tags}</span>
          </button>`;
        })
        .join("");
    }

    els.root.classList.add("open");
    document.body.classList.add("modal-open");
    if (push) pushUrl(urlParamsFromState({ album: name }));
  }

  function openSong(songId, { push = true } = {}) {
    if (!els) return;
    const song = DataLayer.getSong(songId);
    if (!song) return;

    const history = DataLayer.performanceHistoryFor(songId);
    const { shows, times } = DataLayer.performanceCountsFor(songId);
    const never = times === 0;
    const lastDate = history[0]?.latest_date || null;

    els.root.dataset.mode = "song";
    els.root.dataset.songId = songId;
    els.root.dataset.concertId = "";
    clearAlbumAttr();
    els.title.textContent = song.title;
    els.sub.textContent =
      song.language === "國語"
        ? "國語"
        : song.release_year
          ? String(song.release_year)
          : "";
    setSessionControlsVisible(false);

    const parts = DataLayer.albumParts(song.album);
    const albumBtns = parts
      .map(
        (name) =>
          `<button type="button" class="meta-album-name" data-album="${escapeHtml(name)}">${escapeHtml(name)}</button>`
      )
      .join('<span class="meta-album-sep">、</span>');

    const historyHTML = history.length
      ? history.map(ticketHTML).join("")
      : `<div class="history-empty">尚無現場演出紀錄。</div>`;

    const historyLabel = never
      ? "演出紀錄（尚未有Live版）"
      : `演出紀錄（${shows} 場演唱會／巡演，共 ${times} 次）`;

    els.list.innerHTML = `
      <div class="overlay-song">
        <div class="song-meta">
          ${
            parts.length || song.release_year
              ? `<div class="meta-row meta-album">${albumBtns}${
                  song.release_year
                    ? `<span class="meta-year">${song.release_year}</span>`
                    : ""
                }</div>`
              : ""
          }
        </div>
        ${
          never
            ? `<div class="never-badge">尚未有演唱會Live版</div>`
            : `<div class="last-performed">🎤 最近演唱：${DataLayer.timeSince(lastDate)}</div>`
        }
        <div class="overlay-song-history-label">${historyLabel}</div>
        <div class="history-list open">${historyHTML}</div>
      </div>`;

    els.root.classList.add("open");
    document.body.classList.add("modal-open");
    if (push) pushUrl(urlParamsFromState({ song: songId }));
  }

  function closeModalOnly({ updateUrl = true } = {}) {
    if (!els) return;
    const mode = els.root.dataset.mode;
    const highlightSong = els.root.dataset.highlightSong || "";
    const songId = els.root.dataset.songId || "";
    els.root.classList.remove("open");
    document.body.classList.remove("modal-open");

    if (opts.syncUrl && updateUrl) {
      if (mode === "setlist") {
        const params = new URLSearchParams();
        const keep = highlightSong || songId;
        if (keep) params.set("song", keep);
        replaceUrl(params);
      } else if (mode === "album" || mode === "song") {
        replaceUrl(new URLSearchParams());
      }
    }

    els.root.dataset.mode = "";
    els.root.dataset.concertId = "";
    els.root.dataset.songId = "";
    clearAlbumAttr();
    els.root.dataset.highlightSong = "";
  }

  function init(options = {}) {
    opts = {
      syncUrl: !!options.syncUrl,
      onJumpSong: options.onJumpSong || null,
    };

    els = {
      root: document.getElementById("setlist-modal"),
      title: document.getElementById("setlist-modal-title"),
      sub: document.getElementById("setlist-modal-sub"),
      session: document.getElementById("setlist-session-select"),
      sessionLabel: document.querySelector('label[for="setlist-session-select"]'),
      list: document.getElementById("setlist-modal-list"),
    };

    if (!els.root || !els.session || !els.list) {
      els = null;
      return;
    }

    els.session.addEventListener("change", () => {
      if (els.root.dataset.mode !== "setlist") return;
      const sessionId = els.session.value;
      renderSetlist(sessionId, els.root.dataset.highlightSong || "");
      if (opts.syncUrl) {
        const params = new URLSearchParams(location.search);
        params.set("concert", els.root.dataset.concertId || params.get("concert") || "");
        params.set("session", sessionId);
        if (els.root.dataset.highlightSong) {
          params.set("song", els.root.dataset.highlightSong);
        }
        replaceUrl(params);
      }
    });

    els.root.addEventListener("click", (e) => {
      // Prefer close / backdrop so empty data-album="" on the modal root
      // (from dataset clears) never hijacks the close click.
      if (e.target.closest("[data-close-modal]") || e.target === els.root) {
        closeModalOnly();
        return;
      }

      const albumBtn = e.target.closest("[data-album]");
      const albumName = albumBtn?.getAttribute("data-album")?.trim();
      if (albumName) {
        openAlbum(albumName);
        return;
      }

      const concertBtn = e.target.closest("[data-concert]");
      const concertId = concertBtn?.getAttribute("data-concert")?.trim();
      if (concertId) {
        const songId = els.root.dataset.songId || els.root.dataset.highlightSong || "";
        openSetlist(concertId, songId);
        return;
      }

      const jump = e.target.closest("[data-jump-song]");
      if (jump) {
        const id = jump.getAttribute("data-jump-song");
        if (opts.onJumpSong) {
          closeModalOnly({ updateUrl: false });
          opts.onJumpSong(id);
        } else {
          openSong(id, { push: false });
        }
        return;
      }

      if (e.target.closest("[data-close-modal]") || e.target === els.root) {
        closeModalOnly();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && els.root.classList.contains("open")) {
        closeModalOnly();
      }
    });
  }

  return {
    init,
    openSetlist,
    openAlbum,
    openSong,
    close: closeModalOnly,
    pushSongUrl(songId) {
      if (!opts.syncUrl || !songId) return;
      pushUrl(urlParamsFromState({ song: songId }));
    },
  };
})();
