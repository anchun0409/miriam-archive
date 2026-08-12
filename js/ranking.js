(async function () {
  const list = document.getElementById("rank-list");
  const resultCount = document.getElementById("result-count");

  await DataLayer.load();
  await Likes.loadAll();

  const songs = DataLayer.ownSongs().map((s) => ({
    song: s,
    likes: Likes.countFor(s.song_id),
    lastDate: DataLayer.mostRecentDateFor(s.song_id),
  }));

  songs.sort((a, b) => {
    if (b.likes !== a.likes) return b.likes - a.likes;
    const da = a.lastDate || "0000-00-00";
    const db = b.lastDate || "0000-00-00";
    return da < db ? 1 : da > db ? -1 : 0;
  });

  resultCount.textContent = `共 ${songs.length} 首，按喜歡數排列（Wishlist）`;

  list.innerHTML = songs
    .map((entry, i) => {
      const { song, likes, lastDate } = entry;
      const lastPerformedText = lastDate
        ? `最近演唱：${DataLayer.timeSince(lastDate)}（${lastDate}）`
        : "尚未有演唱會Live版";
      return `
      <div class="rank-row">
        <div class="rank-num">${i + 1}</div>
        <div class="rank-info">
          <div class="rank-title">${song.title}</div>
          <div class="rank-sub">${lastPerformedText}</div>
        </div>
        <div class="rank-likes">
          <div class="count">${likes}</div>
          <div class="label">喜歡</div>
        </div>
      </div>`;
    })
    .join("");
})();
