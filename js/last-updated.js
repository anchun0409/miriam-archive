// Shows "最後更新：YYYY-MM-DD" in the footer from data/last-updated.json
// (auto-stamped by GitHub Actions on each push — see .github/workflows/).

(async function () {
  const el = document.getElementById("last-updated");
  if (!el) return;

  try {
    const res = await fetch("data/last-updated.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    const date = data.date || (data.updated_at || "").slice(0, 10);
    if (date) el.textContent = `最後更新：${date}`;
  } catch (e) {
    el.textContent = "";
  }
})();
