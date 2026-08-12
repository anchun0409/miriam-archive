// Shared data layer: loads data.json, builds per-song performance history
// grouped by concert (with all sessions listed), and exposes helpers used by
// both the main page and the ranking page.

const DataLayer = (() => {
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

  function albumParts(album) {
    return stripAlbumYear(album)
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p && p.toLowerCase() !== "n.a.");
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

  function getConcert(concertId) {
    return concertsById[concertId] || null;
  }

  function getSong(songId) {
    return songsById[songId] || null;
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
    formatLocation,
    locationKey,
    stripAlbumYear,
    albumParts,
    songsInAlbum,
    getConcert,
    getSong,
    setlistForSession,
    sessionsForConcert,
  };
})();
