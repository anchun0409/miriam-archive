// Persistent, cross-visit "likes" backed by Tencent CloudBase (云开发).
// Chosen over Supabase because CloudBase's servers/CDN sit inside mainland
// China's network, so it stays fast and reachable there -- see README.md.
//
// One anonymous device (CloudBase's own anonymous-auth identity) can like a
// given song once. Requires window.APP_CONFIG (see config.js) and the
// self-hosted SDK bundle at js/vendor/cloudbase.bundle.js (loaded on the
// page before this file).

const Likes = (() => {
  let app = null;
  let db = null;
  let signedIn = false;
  let countsCache = null; // song_id -> count
  let likedSetCache = null; // Set of song_ids this device already liked

  function getApp() {
    if (app) return app;
    const { CLOUDBASE_ENV_ID } = window.APP_CONFIG || {};
    if (!CLOUDBASE_ENV_ID || CLOUDBASE_ENV_ID.includes("YOUR-ENV-ID")) {
      return null; // not configured yet -- app still works, likes just no-op
    }
    app = window.cloudbase.init({ env: CLOUDBASE_ENV_ID });
    db = app.database();
    return app;
  }

  async function ensureSignedIn() {
    if (signedIn) return true;
    const a = getApp();
    if (!a) return false;
    try {
      await a.auth().signInAnonymously();
      signedIn = true;
      return true;
    } catch (e) {
      console.error("CloudBase anonymous sign-in failed:", e);
      return false;
    }
  }

  // Deterministic doc id per (song, device) -- CloudBase rejects a second
  // .add() with a duplicate _id, which is what enforces "one like per song
  // per device" at the database level (mirrors a unique constraint).
  async function myDeviceId() {
    const loginState = await app.auth().getLoginState();
    return loginState?.user?.uid || loginState?.uid || "anon";
  }

  async function loadAll() {
    countsCache = {};
    likedSetCache = new Set();
    const ok = await ensureSignedIn();
    if (!ok) return { counts: countsCache, liked: likedSetCache };

    try {
      const me = await myDeviceId();
      // Pull all like docs (song_id, device_id) -- fine for a small fan site;
      // for very large volumes this would move to a cloud-function aggregate.
      const res = await db.collection("likes").limit(1000).get();
      (res.data || []).forEach((row) => {
        countsCache[row.song_id] = (countsCache[row.song_id] || 0) + 1;
        if (row.device_id === me) likedSetCache.add(row.song_id);
      });
    } catch (e) {
      console.error("Failed to load likes:", e);
    }
    return { counts: countsCache, liked: likedSetCache };
  }

  function countFor(songId) {
    return (countsCache && countsCache[songId]) || 0;
  }

  function hasLiked(songId) {
    return !!(likedSetCache && likedSetCache.has(songId));
  }

  async function like(songId) {
    const ok = await ensureSignedIn();
    if (!ok) {
      alert("Likes aren't connected yet -- add your CloudBase env ID to js/config.js (see README).");
      return false;
    }
    if (hasLiked(songId)) return false; // one like per device per song

    const me = await myDeviceId();
    try {
      await db.collection("likes").add({
        _id: `${songId}__${me}`,
        song_id: songId,
        device_id: me,
      });
    } catch (e) {
      // duplicate _id just means it was already liked (e.g. another tab)
      console.warn("Like insert error:", e);
      return false;
    }
    likedSetCache.add(songId);
    countsCache[songId] = (countsCache[songId] || 0) + 1;
    return true;
  }

  return { loadAll, countFor, hasLiked, like };
})();
