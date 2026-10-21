// Shared data layer: loads data.json, builds per-song performance history
// grouped by concert (with all sessions listed), and exposes helpers used by
// both the main page and the ranking page.

// Attach to window so pages can detect load via window.DataLayer
// (top-level const does not become a window property).
window.DataLayer = (() => {
  let raw = null;
  let songsById = {};
  let sessionsById = {};
  let concertsById = {};

  const LOCAL_ONLY_COUNTRIES = new Set(["中國", "香港", "澳門"]);
  const VENUE_SHORT = {
    紅磡香港體育館: "紅館",
  };

  async function load() {
    if (raw) return raw;
    const res = await fetch("data/data.json", { cache: "no-store" });
    raw = await res.json();

    songsById = {};
    raw.songs.forEach((s) => (songsById[s.song_id] = s));

    concertsById = {};
    sessionsById = {};
    raw.concerts.forEach((c) => {
      concertsById[c.concert_id] = c;
      c.sessions.forEach((sess) => {
        sessionsById[sess.session_id] = { ...sess, concert_id: c.concert_id };
      });
    });

    return raw;
  }

  function shortVenue(venue) {
    if (!venue) return "";
    return VENUE_SHORT[venue] || venue;
  }

  function formatLocation(session, { withVenue = true } = {}) {
    const city = session.city || "";
    const country = session.country || "";
    const venue = shortVenue(session.venue || "");
    let place = city;
    if (country && !LOCAL_ONLY_COUNTRIES.has(country) && country !== city) {
      place = [city, country].filter(Boolean).join("/");
    }
    if (withVenue && venue) return `${place}（${venue}）`;
    return place;
  }

  function locationKey(session) {
    return [
      session.city || "",
      session.country || "",
      shortVenue(session.venue || ""),
    ].join("|");
  }

  function stripAlbumYear(album) {
    if (!album) return "";
    return album
      .replace(/\s*\(\d{4}\)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // Split multi-album fields on "), " between year tags so names that
  // contain commas (e.g. "Play It Loud, Kiss Me Soft (2000)") stay whole.
  function albumParts(album) {
    if (!album) return [];
    const raw = String(album).trim();
    if (!raw || raw.toLowerCase() === "n.a.") return [];

    const chunks = raw.split(/\)\s*,\s*/).map((chunk, i, arr) => {
      let s = chunk.trim();
      if (i < arr.length - 1 && !/\)$/.test(s)) s += ")";
      return stripAlbumYear(s);
    });

    return chunks.filter((p) => p && p.toLowerCase() !== "n.a.");
  }

  // For a given song, build a list of "concert entries": one per concert,
  // each carrying every session (date/venue) at which the song was performed
  // under that concert, sorted most-recent-first.
  function performanceHistoryFor(songId) {
    const perfs = raw.performances.filter((p) => p.song_id === songId);
    const byConcert = {};

    perfs.forEach((p) => {
      const session = sessionsById[p.session_id];
      if (!session) return;
      const concert = concertsById[session.concert_id];
      if (!concert) return;
      if (!byConcert[concert.concert_id]) {
        byConcert[concert.concert_id] = {
          concert_id: concert.concert_id,
          concert_name: concert.concert_name,
          concert_name_english: concert.concert_name_english,
          sessions: [],
          latest_date: null,
        };
      }
      byConcert[concert.concert_id].sessions.push({
        ...session,
        is_main_rundown: p.is_main_rundown,
        notes: p.notes,
      });
    });

    const entries = Object.values(byConcert).map((entry) => {
      entry.sessions.sort((a, b) => (a.date < b.date ? 1 : -1));
      entry.latest_date = entry.sessions[0]?.date || null;
      return entry;
    });

    entries.sort((a, b) => (a.latest_date < b.latest_date ? 1 : -1));
    return entries;
  }

  function performanceCountsFor(songId) {
    const history = performanceHistoryFor(songId);
    const shows = history.length;
    const times = history.reduce((n, e) => n + e.sessions.length, 0);
    return { shows, times };
  }

  function hasBeenPerformed(songId) {
    return performanceCountsFor(songId).times > 0;
  }

  function mostRecentDateFor(songId) {
    const history = performanceHistoryFor(songId);
    return history[0]?.latest_date || null;
  }

  function timeSince(dateStr) {
    if (!dateStr) return "尚無已知現場演出紀錄";
    const then = new Date(dateStr + "T00:00:00");
    const now = new Date();
    let years = now.getFullYear() - then.getFullYear();
    let months = now.getMonth() - then.getMonth();
    if (now.getDate() < then.getDate()) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years <= 0 && months <= 0) return "一個月內";
    const parts = [];
    if (years > 0) parts.push(`${years} 年`);
    if (months > 0) parts.push(`${months} 個月`);
    return `${parts.join("")}前`;
  }

  function allSongs() {
    return raw.songs;
  }

  function ownSongs() {
    return raw.songs.filter((s) => !s.is_other_artist);
  }

  function isOtherArtist(songOrId) {
    const song =
      typeof songOrId === "string" ? songsById[songOrId] : songOrId;
    return !!(song && song.is_other_artist);
  }

  function originalArtist(songOrId) {
    const song =
      typeof songOrId === "string" ? songsById[songOrId] : songOrId;
    return (song && song.original_artist) || "";
  }

  function getConcert(concertId) {
    return concertsById[concertId] || null;
  }

  function getSong(songId) {
    return songsById[songId] || null;
  }

  function allConcerts() {
    return raw.concerts;
  }

  function allPerformances() {
    return raw.performances;
  }

  function allSessions() {
    return Object.values(sessionsById);
  }

  function isLakokConcert(concert) {
    const name = concert?.concert_name || "";
    return /拉闊|Music is Live/i.test(name);
  }

  // Fan labels for major solo shows vs world tours
  const GECHANG_CONCERT_IDS = new Set([
    "C001",
    "C015",
    "C017",
    "C022",
    "C025",
    "C002",
    "C003",
    "C004",
    "C006",
    "C009",
    "C008",
  ]);
  const GEXUN_CONCERT_IDS = new Set([
    "C005",
    "C033",
    "C007",
    "C031",
    "C034",
    "C032",
  ]);

  function concertIdOf(concertOrId) {
    return typeof concertOrId === "string"
      ? concertOrId
      : concertOrId?.concert_id;
  }

  function isGechangConcert(concertOrId) {
    return GECHANG_CONCERT_IDS.has(concertIdOf(concertOrId));
  }

  function isGexunConcert(concertOrId) {
    return GEXUN_CONCERT_IDS.has(concertIdOf(concertOrId));
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Concert name + optional small「個唱」/「個巡」badge (HTML). */
  function concertNameHTML(concertOrId, nameOverride) {
    const concert =
      typeof concertOrId === "string"
        ? concertsById[concertOrId]
        : concertOrId;
    const name =
      nameOverride != null
        ? nameOverride
        : concert?.concert_name || String(concertOrId || "");
    const id = concertIdOf(concert || concertOrId);
    let tag = "";
    if (GEXUN_CONCERT_IDS.has(id)) {
      tag = '<span class="tag-gechang tag-gexun">個巡</span>';
    } else if (GECHANG_CONCERT_IDS.has(id)) {
      tag = '<span class="tag-gechang">個唱</span>';
    }
    return `${escapeHtml(name)}${tag ? ` ${tag}` : ""}`;
  }

  function isCollabOrSpecialConcert(concert) {
    const name = concert?.concert_name || "";
    return /拉闊|Music is Live|六神合體|MOOV Live|ID CLUB|狂熱份子|又一個叱吒/i.test(
      name
    );
  }

  /** Solo ticketed tours/shows (excludes 拉闊 / collab / radio specials). */
  function isPersonalConcert(concert) {
    return !!(concert && !isCollabOrSpecialConcert(concert));
  }

  /** Sources + Fun Facts theme coverage: every concert in the database. */
  function isThemeConcert(concert) {
    return !!concert;
  }

  function themeConcerts() {
    return raw.concerts
      .filter((c) => isThemeConcert(c))
      .map((c) => {
        const sessions = [...(c.sessions || [])].sort((a, b) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0
        );
        const cities = [...new Set(sessions.map((s) => s.city).filter(Boolean))];
        const countries = [
          ...new Set(sessions.map((s) => s.country).filter(Boolean)),
        ];
        return {
          concert: c,
          sessions,
          session_count: sessions.length,
          first_date: sessions[0]?.date || "",
          last_date: sessions[sessions.length - 1]?.date || "",
          cities,
          countries,
          is_lakok: isLakokConcert(c),
          is_personal: isPersonalConcert(c),
        };
      })
      .sort((a, b) =>
        a.first_date < b.first_date ? -1 : a.first_date > b.first_date ? 1 : 0
      );
  }

  /** Stats for Fun Facts page */
  function funFacts() {
    const sessions = allSessions();
    const themes = themeConcerts();

    const totalShows = sessions.length;
    const personalShows = sessions.filter((s) => {
      const c = concertsById[s.concert_id];
      return c && isPersonalConcert(c);
    }).length;

    const themeSessions = sessions.filter((s) => {
      const c = concertsById[s.concert_id];
      return c && isThemeConcert(c);
    });
    const countries = new Set(
      themeSessions.map((s) => s.country).filter(Boolean)
    );
    const cities = new Set(themeSessions.map((s) => s.city).filter(Boolean));

    // song count per session
    const perSession = {};
    raw.performances.forEach((p) => {
      perSession[p.session_id] = (perSession[p.session_id] || 0) + 1;
    });
    const sessionRows = sessions
      .map((s) => ({
        session: s,
        concert: concertsById[s.concert_id],
        count: perSession[s.session_id] || 0,
      }))
      .filter((r) => r.count > 0 && r.concert && isThemeConcert(r.concert))
      .sort((a, b) => b.count - a.count || (a.session.date < b.session.date ? 1 : -1));
    const topSongCountShows = sessionRows.slice(0, 5);

    // top 10 songs by performance times
    const songCounts = {};
    raw.performances.forEach((p) => {
      songCounts[p.song_id] = (songCounts[p.song_id] || 0) + 1;
    });
    const topSongs = Object.entries(songCounts)
      .map(([song_id, times]) => ({
        song: songsById[song_id],
        times,
      }))
      .filter((x) => x.song && !x.song.is_other_artist)
      .sort((a, b) => b.times - a.times || a.song.title.localeCompare(b.song.title, "zh-Hant"))
      .slice(0, 10);

    // top 5 cities
    const cityCounts = {};
    sessions.forEach((s) => {
      const city = s.city || "未知";
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    });
    const topCities = Object.entries(cityCounts)
      .map(([city, times]) => ({ city, times }))
      .sort((a, b) => b.times - a.times || a.city.localeCompare(b.city, "zh-Hant"))
      .slice(0, 5);

    // encore top 5
    const encoreCounts = {};
    raw.performances.forEach((p) => {
      if (p.is_main_rundown !== false) return;
      encoreCounts[p.song_id] = (encoreCounts[p.song_id] || 0) + 1;
    });
    const encoreTop = Object.entries(encoreCounts)
      .map(([song_id, times]) => ({
        song: songsById[song_id],
        times,
      }))
      .filter((x) => x.song && !x.song.is_other_artist)
      .sort((a, b) => b.times - a.times || a.song.title.localeCompare(b.song.title, "zh-Hant"))
      .slice(0, 5);

    // Minor Classics / B minor → later main rundown elsewhere, excluding
    // songs already sung more than 3 times before their first Minor date.
    const minorConcertIds = new Set(
      raw.concerts
        .filter((c) => /Minor Classics|B minor/i.test(c.concert_name))
        .map((c) => c.concert_id)
    );
    const firstMinorDate = {};
    const firstMinorConcert = {};
    raw.performances.forEach((p) => {
      const sess = sessionsById[p.session_id];
      if (!sess || !minorConcertIds.has(sess.concert_id)) return;
      const prev = firstMinorDate[p.song_id];
      if (!prev || sess.date < prev) {
        firstMinorDate[p.song_id] = sess.date;
        firstMinorConcert[p.song_id] = sess.concert_id;
      }
    });
    const minorClassicsExclude = new Set(["超齡", "亦舒說", "我是羊"]);
    const minorThenMain = [];
    Object.keys(firstMinorDate).forEach((song_id) => {
      const song = songsById[song_id];
      if (!song || song.is_other_artist) return;
      const minorDate = firstMinorDate[song_id];
      const priorTimes = raw.performances.filter((p) => {
        if (p.song_id !== song_id) return false;
        const sess = sessionsById[p.session_id];
        return sess && sess.date < minorDate;
      }).length;
      // Exclude songs already sung more than 3 times before Minor / B minor
      // (= Minor was not 1st / 2nd / 3rd / 4th live). Keep prior ≤ 3.
      if (priorTimes > 3) return;

      const originName =
        concertsById[firstMinorConcert[song_id]]?.concert_name || "";
      if (
        /Minor Classics/i.test(originName) &&
        minorClassicsExclude.has(song.title)
      ) {
        return;
      }

      const laterMain = raw.performances.some((p) => {
        if (p.song_id !== song_id || p.is_main_rundown === false) return false;
        const sess = sessionsById[p.session_id];
        if (!sess || minorConcertIds.has(sess.concert_id)) return false;
        return sess.date > minorDate;
      });
      if (laterMain) {
        const origin = concertsById[firstMinorConcert[song_id]];
        minorThenMain.push({
          song,
          first_date: minorDate,
          first_concert: origin?.concert_name || firstMinorConcert[song_id],
          first_concert_id: firstMinorConcert[song_id],
          prior_times: priorTimes,
        });
      }
    });
    minorThenMain.sort((a, b) =>
      a.first_date < b.first_date ? -1 : a.first_date > b.first_date ? 1 : a.song.title.localeCompare(b.song.title, "zh-Hant")
    );

    return {
      totalShows,
      personalShows,
      themeConcertCount: themes.length,
      countryCount: countries.size,
      cityCount: cities.size,
      themeConcerts: themes,
      topSongCountShows,
      topSongs,
      topCities,
      encoreTop,
      minorThenMain,
    };
  }

  function songsInAlbum(albumName) {
    const target = stripAlbumYear(albumName);
    if (!target) return [];
    return raw.songs.filter((s) => albumParts(s.album).includes(target));
  }

  // Preserve JSON order of performances for a session as the setlist order.
  function setlistForSession(sessionId) {
    return raw.performances
      .filter((p) => p.session_id === sessionId)
      .map((p) => ({
        ...p,
        song: songsById[p.song_id] || null,
      }));
  }

  function sessionsForConcert(concertId) {
    const concert = concertsById[concertId];
    if (!concert) return [];
    return [...concert.sessions].sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  return {
    load,
    performanceHistoryFor,
    performanceCountsFor,
    hasBeenPerformed,
    mostRecentDateFor,
    timeSince,
    allSongs,
    ownSongs,
    isOtherArtist,
    originalArtist,
    formatLocation,
    locationKey,
    stripAlbumYear,
    albumParts,
    songsInAlbum,
    getConcert,
    getSong,
    allConcerts,
    allPerformances,
    allSessions,
    funFacts,
    themeConcerts,
    isPersonalConcert,
    isThemeConcert,
    isLakokConcert,
    isGechangConcert,
    isGexunConcert,
    concertNameHTML,
    setlistForSession,
    sessionsForConcert,
  };
})();
