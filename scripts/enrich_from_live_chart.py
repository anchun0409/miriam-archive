#!/usr/bin/env python3
"""
Enrich/correct local Miriam Yeung dataset from elaineyupei/my-live-chart (Traditional Chinese).

Source: https://raw.githubusercontent.com/elaineyupei/my-live-chart/main/index.html
  (embedded `const DT = {...}` — Traditional Chinese chart data)

Updates:
  - data/data.json
  - song album.csv
  - miriam_yeung_data_filled.xlsx (rewritten from enriched JSON)

Preserves song_id on title match (normalized punctuation) and is_other_artist flags.
"""
from __future__ import annotations

import csv
import json
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

try:
    import openpyxl
    from openpyxl import Workbook
except ImportError:
    openpyxl = None

ROOT = Path(__file__).resolve().parent.parent
DATA_JSON = ROOT / "data" / "data.json"
CSV_PATH = ROOT / "song album.csv"
XLSX_PATH = ROOT / "miriam_yeung_data_filled.xlsx"
DEFAULT_HTML = Path("/tmp/my-live-chart/index.html")
SOURCE_URL = "https://raw.githubusercontent.com/elaineyupei/my-live-chart/main/index.html"

# Extra title aliases: local title -> live-chart title
TITLE_ALIASES = {
    "因為所以(畢氏定理)": "因為所以",
    "慢·熱...北海道夏": "慢·熱……北海道夏",
    "花好月圓夜 - 廣東版": "花好月圓夜(粵)",
    "鸞鳳和鳴 - 廣東版": "鸞鳳和鳴",
    "花好月圓夜 - 國語版": "花好月圓夜(國)",
    "萬世流芳 - 國語版": "萬世流芳",
    "長信不如短訊 - 長痛不如短痛": "長信不如短訊",
}


def norm_title(s: str) -> str:
    if not s:
        return ""
    s = str(s).strip()
    s = s.replace("＋", "+").replace("—", "-").replace("–", "-").replace("－", "-")
    s = s.replace("？", "?").replace("！", "!").replace("：", ":").replace("；", ";")
    s = s.replace("（", "(").replace("）", ")").replace("「", '"').replace("」", '"')
    s = s.replace("『", '"').replace("』", '"').replace("、", ",").replace("，", ",")
    s = s.replace("……", "...").replace("…", "...")
    s = s.replace(" ", "").replace("\u3000", "").lower()
    return s


def cjk_ratio(s: str) -> float:
    if not s:
        return 0.0
    return sum(1 for c in s if "\u4e00" <= c <= "\u9fff") / len(s)


def prefer_credit(ours: str, lc: str) -> str:
    """Fill empties; prefer Traditional Chinese over romanization; keep richer local detail."""
    ours = (ours or "").strip()
    lc = (lc or "").strip()
    if ours in ("?", "？", "n.a.", "N.A.", "na", "-", "—"):
        ours = ""
    if not lc:
        return ours
    if not ours:
        return lc
    if ours == lc:
        return ours
    # Keep richer local when it already contains LC (e.g. 于逸堯@人山人海)
    if lc in ours:
        return ours
    if ours in lc:
        return lc
    # Prefer Chinese when local is mostly Latin
    if cjk_ratio(ours) < 0.3 and cjk_ratio(lc) >= 0.3:
        return lc
    # Same-script small corrections from LC (e.g. 許紹榮→許少榮, 禇→褚)
    if cjk_ratio(ours) >= 0.5 and cjk_ratio(lc) >= 0.5 and abs(len(ours) - len(lc)) <= 2:
        return lc
    return ours


def strip_album_year(album: str):
    album = (album or "").strip()
    m = re.match(r"^(.*?)\s*\((\d{4})\)\s*$", album)
    if m:
        return m.group(1).strip(), int(m.group(2))
    return album, None


def format_album(name: str, year) -> str:
    name = (name or "").strip()
    if not name:
        return ""
    if year and not re.search(r"\(\d{4}\)$", name):
        return f"{name} ({int(year)})"
    return name


def is_empty_album(album: str) -> bool:
    a = (album or "").strip().lower()
    if a in ("", "n.a.", "na", "n/a", "none"):
        return True
    # e.g. "n.a. (2006)" from prior incomplete fills
    name, _ = strip_album_year(album or "")
    return name.strip().lower() in ("", "n.a.", "na", "n/a", "none")

def download_html(dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1_000_000:
        return dest
    print(f"Downloading {SOURCE_URL} -> {dest}")
    with urllib.request.urlopen(SOURCE_URL, timeout=120) as resp:
        dest.write_bytes(resp.read())
    return dest


def parse_dt(html_path: Path) -> dict:
    text = html_path.read_text(encoding="utf-8")
    marker = "const DT = "
    i = text.find(marker)
    if i < 0:
        raise RuntimeError("const DT not found in HTML (need Traditional Chinese build)")
    obj, _ = json.JSONDecoder().raw_decode(text, i + len(marker))
    return obj


def build_lc_song_index(dt: dict):
    by_norm = {}
    for s in dt["songs"]:
        by_norm[norm_title(s[0])] = s
    return by_norm


def match_lc_song(title: str, lc_index: dict):
    nt = norm_title(title)
    if nt in lc_index:
        return lc_index[nt]
    alias = TITLE_ALIASES.get(title)
    if alias:
        ant = norm_title(alias)
        if ant in lc_index:
            return lc_index[ant]
    # try stripping remix / version suffixes after " - "
    if " - " in title:
        base = title.split(" - ", 1)[0].strip()
        bt = norm_title(base)
        if bt in lc_index:
            return lc_index[bt]
    return None


def enrich_songs(songs: list, lc_index: dict) -> dict:
    stats = defaultdict(int)
    corrections = []

    for song in songs:
        lc = match_lc_song(song["title"], lc_index)
        if not lc:
            stats["unmatched"] += 1
            continue
        stats["matched"] += 1

        lc_title, lc_year, lc_album = lc[0], lc[3], lc[4]
        lc_ly, lc_co, lc_ar, lc_prod, lc_label = lc[5], lc[6], lc[11], lc[12], lc[13]

        # Album / year
        our_album_raw = song.get("album") or ""
        our_name, our_year_in_album = strip_album_year(our_album_raw)
        if is_empty_album(our_album_raw) and lc_album:
            new_album = format_album(lc_album, lc_year)
            song["album"] = new_album
            stats["album_filled"] += 1
            corrections.append(("album_fill", song["title"], our_album_raw, new_album))
        elif lc_album and our_name and not is_empty_album(our_name) and "," not in our_name and "，" not in our_name:
            # Single-album entries: normalize punctuation / casing from LC when close
            if norm_title(our_name) != norm_title(lc_album):
                # Only replace when local looks like a truncated / alternate of LC
                if norm_title(our_name).replace(",", "") == norm_title(lc_album).replace(",", ""):
                    song["album"] = format_album(lc_album, lc_year or song.get("release_year"))
                    stats["album_normalized"] += 1
                    corrections.append(("album_norm", song["title"], our_album_raw, song["album"]))
        if lc_year:
            try:
                ly = int(lc_year)
            except (TypeError, ValueError):
                ly = None
            if ly:
                oy = song.get("release_year")
                if oy in (None, "", "n.a.", "N.A."):
                    song["release_year"] = ly
                    stats["year_filled"] += 1
                    corrections.append(("year_fill", song["title"], oy, ly))
                else:
                    try:
                        oy_i = int(oy)
                    except (TypeError, ValueError):
                        oy_i = None
                    if oy_i is not None and oy_i != ly:
                        # Correct year from LC when album name matches (or was empty)
                        album_name, _ = strip_album_year(song.get("album") or "")
                        if is_empty_album(album_name) or norm_title(album_name) == norm_title(lc_album or ""):
                            song["release_year"] = ly
                            # Keep album year suffix in sync (never write "n.a. (year)")
                            if not is_empty_album(album_name):
                                song["album"] = format_album(album_name, ly)
                            elif lc_album:
                                song["album"] = format_album(lc_album, ly)
                            stats["year_corrected"] += 1
                            corrections.append(("year_fix", song["title"], oy_i, ly))
        # Credits
        for field, lc_val, key in (
            ("lyricist", lc_ly, "lyricist"),
            ("composer", lc_co, "composer"),
            ("arranger", lc_ar, "arranger"),
        ):
            before = song.get(field) or ""
            after = prefer_credit(before, lc_val or "")
            if after != before:
                song[field] = after
                stats[f"{key}_updated"] += 1
                corrections.append((key, song["title"], before, after))

        # Stash producer/label for CSV sync (not in JSON schema)
        song["_lc_producer"] = (lc_prod or "").strip()
        song["_lc_label"] = (lc_label or "").strip()
        song["_lc_album_bare"] = (lc_album or "").strip()
        song["_lc_year"] = lc_year

        # Preserve is_other_artist / language / song_id (no-op)
        _ = song.get("is_other_artist"), song.get("language"), song.get("song_id")

    # Add LC-only songs (new IDs)
    existing = {norm_title(s["title"]) for s in songs}
    for alias_src, alias_dst in TITLE_ALIASES.items():
        existing.add(norm_title(alias_dst))
    max_n = 0
    for s in songs:
        m = re.match(r"S(\d+)$", str(s.get("song_id") or ""))
        if m:
            max_n = max(max_n, int(m.group(1)))

    for lc in sorted(lc_index.values(), key=lambda x: x[0]):
        if norm_title(lc[0]) in existing:
            continue
        # Skip if any local remix base matches
        if any(norm_title(s["title"].split(" - ")[0]) == norm_title(lc[0]) for s in songs):
            continue
        max_n += 1
        sid = f"S{max_n:03d}"
        songs.append({
            "song_id": sid,
            "title": lc[0],
            "title_english": "",
            "album": format_album(lc[4], lc[3]),
            "release_year": lc[3],
            "lyricist": lc[5] or "",
            "composer": lc[6] or "",
            "arranger": lc[11] or "",
            "notes": "",
            "is_other_artist": False,
            "language": "",
            "_lc_producer": lc[12] or "",
            "_lc_label": lc[13] or "",
            "_lc_album_bare": lc[4] or "",
            "_lc_year": lc[3],
        })
        existing.add(norm_title(lc[0]))
        stats["songs_added"] += 1
        corrections.append(("song_add", lc[0], "", sid))

    return {"stats": dict(stats), "corrections": corrections}


def country_for_city(city: str) -> str:
    city = (city or "").strip()
    mapping = {
        "香港": "香港",
        "澳門": "澳門",
        "台北": "台灣",
        "臺北": "台灣",
        "高雄": "台灣",
        "台中": "台灣",
        "新加坡": "新加坡",
        "吉隆坡": "馬來西亞",
        "倫敦": "英國",
        "悉尼": "澳洲",
        "墨爾本": "澳洲",
        "溫哥華": "加拿大",
        "多倫多": "加拿大",
        "洛杉磯": "美國",
        "舊金山": "美國",
        "紐約": "美國",
    }
    if city in mapping:
        return mapping[city]
    # Mainland default
    return "中國"


def match_topic_to_concert(topic: dict, concerts: list):
    topic_dates = {sh["date"] for sh in topic.get("shows", [])}
    if not topic_dates:
        return None
    best = None
    best_overlap = 0
    for c in concerts:
        c_dates = {s["date"] for s in c.get("sessions", [])}
        overlap = len(topic_dates & c_dates)
        if overlap > best_overlap:
            best_overlap = overlap
            best = c
    if best_overlap == 0:
        return None
    return best


def enrich_concerts_and_performances(data: dict, dt: dict) -> dict:
    stats = defaultdict(int)
    notes = []
    songs = data["songs"]
    song_by_norm = {}
    for s in songs:
        song_by_norm[norm_title(s["title"])] = s["song_id"]
        for alias_src, alias_dst in TITLE_ALIASES.items():
            if norm_title(s["title"]) == norm_title(alias_src):
                song_by_norm[norm_title(alias_dst)] = s["song_id"]
            if norm_title(s["title"]) == norm_title(alias_dst):
                song_by_norm[norm_title(alias_src)] = s["song_id"]

    # Index LC song list for other-artist detection via setlist index -1
    lc_songs = dt["songs"]

    concerts = data["concerts"]
    # Existing session lookup by date
    session_by_date = {}
    for c in concerts:
        for s in c["sessions"]:
            session_by_date[s["date"]] = (c, s)

    # Next concert id
    max_c = 0
    for c in concerts:
        m = re.match(r"C(\d+)$", c["concert_id"])
        if m:
            max_c = max(max_c, int(m.group(1)))

    existing_perf = {(p["song_id"], p["session_id"]) for p in data["performances"]}

    for topic in dt["meta"]["topics"]:
        shows = topic.get("shows") or []
        if not shows:
            continue
        concert = match_topic_to_concert(topic, concerts)
        if concert is None:
            max_c += 1
            cid = f"C{max_c:03d}"
            name = (topic.get("full") or topic.get("polish") or topic.get("name") or "").strip()
            concert = {
                "concert_id": cid,
                "concert_name": name,
                "concert_name_english": "",
                "notes": f"來源：my-live-chart {topic.get('tid','')} · {topic.get('type','')}".strip(),
                "sessions": [],
            }
            concerts.append(concert)
            stats["concerts_added"] += 1
            notes.append(("concert_add", cid, name))
        else:
            # Enrich empty English / notes lightly
            if not (concert.get("notes") or "").strip() and topic.get("type"):
                concert["notes"] = topic.get("type") or concert.get("notes") or ""

        # Ensure sessions exist for each show
        for sh in shows:
            date = sh.get("date") or ""
            if not date:
                continue
            if date in session_by_date and session_by_date[date][0]["concert_id"] == concert["concert_id"]:
                sess = session_by_date[date][1]
                # Correct city/venue if empty
                if not (sess.get("city") or "").strip() and sh.get("city"):
                    sess["city"] = sh["city"]
                    stats["session_city_filled"] += 1
                if not (sess.get("venue") or "").strip() and sh.get("venue"):
                    sess["venue"] = sh["venue"]
                    stats["session_venue_filled"] += 1
                if not (sess.get("country") or "").strip():
                    sess["country"] = country_for_city(sess.get("city") or sh.get("city") or "")
            elif date in session_by_date:
                # Date already belongs to another concert — reuse that session
                sess = session_by_date[date][1]
            else:
                # New session under this concert
                n = len(concert["sessions"]) + 1
                sid = f"{concert['concert_id']}-{n}"
                # Avoid id collision
                used = {s["session_id"] for s in concert["sessions"]}
                while sid in used:
                    n += 1
                    sid = f"{concert['concert_id']}-{n}"
                sess = {
                    "session_id": sid,
                    "date": date,
                    "city": sh.get("city") or "",
                    "country": country_for_city(sh.get("city") or ""),
                    "venue": sh.get("venue") or "",
                }
                concert["sessions"].append(sess)
                concert["sessions"].sort(key=lambda x: x["date"])
                session_by_date[date] = (concert, sess)
                stats["sessions_added"] += 1

            # Performances from setlist
            for entry in sh.get("songs") or []:
                # [title, order, fixed/blind, full/partial, badges, ?, song_idx]
                title = entry[0] if entry else ""
                song_idx = entry[6] if len(entry) > 6 else None
                badges = entry[4] if len(entry) > 4 else []
                if not title:
                    continue
                sid = song_by_norm.get(norm_title(title))
                if not sid and " - " in title:
                    sid = song_by_norm.get(norm_title(title.split(" - ")[0]))
                # Map via LC song index
                if not sid and isinstance(song_idx, int) and song_idx >= 0 and song_idx < len(lc_songs):
                    sid = song_by_norm.get(norm_title(lc_songs[song_idx][0]))
                if not sid:
                    stats["perf_unmatched_title"] += 1
                    continue
                key = (sid, sess["session_id"])
                if key in existing_perf:
                    continue
                note_bits = []
                if badges:
                    note_bits.extend(str(b) for b in badges)
                if isinstance(song_idx, int) and song_idx < 0:
                    note_bits.append("其他歌手/非原唱")
                data["performances"].append({
                    "song_id": sid,
                    "session_id": sess["session_id"],
                    "is_main_rundown": True,
                    "notes": "；".join(note_bits),
                })
                existing_perf.add(key)
                stats["performances_added"] += 1

    # Sort concerts by first session date
    def first_date(c):
        dates = [s["date"] for s in c.get("sessions", []) if s.get("date")]
        return min(dates) if dates else "9999"

    concerts.sort(key=first_date)
    data["concerts"] = concerts
    return {"stats": dict(stats), "notes": notes}


def write_csv(songs: list, path: Path) -> None:
    # Build from songs; preserve month/day from existing CSV when title matches
    old_by_title = {}
    if path.exists():
        with path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                old_by_title[norm_title(row.get("track_name") or "")] = row

    fields = [
        "track_name", "album_name", "專輯發行年份", "專輯發行月份", "專輯發行日期",
        "作詞", "作曲", "编曲", "監製", "語種",
    ]
    rows = []
    for s in songs:
        if s.get("is_other_artist"):
            # Keep other-artist songs out of the discography CSV (matches prior app behaviour for wishlist)
            # Actually existing CSV may still list covers? Check — covers are in data.json but CSV is album catalog.
            # Previous CSV had 335 rows without is_other_artist column; covers may be absent.
            # Skip other-artist for CSV discography.
            continue
        bare, y_from_album = strip_album_year(s.get("album") or "")
        year = s.get("release_year") if s.get("release_year") not in (None, "") else (y_from_album or "")
        old = old_by_title.get(norm_title(s["title"]), {})
        month = old.get("專輯發行月份") or "n.a."
        day = old.get("專輯發行日期") or "n.a."
        album_name = bare if bare else (old.get("album_name") or "n.a.")
        if is_empty_album(album_name):
            album_name = s.get("_lc_album_bare") or "n.a."
        producer = s.get("_lc_producer") or old.get("監製") or ""
        # Prefer LC producer when old empty
        if not (producer or "").strip():
            producer = ""
        rows.append({
            "track_name": s["title"],
            "album_name": album_name if album_name else "n.a.",
            "專輯發行年份": year if year not in (None, "") else (old.get("專輯發行年份") or "n.a."),
            "專輯發行月份": month,
            "專輯發行日期": day,
            "作詞": s.get("lyricist") or "",
            "作曲": s.get("composer") or "",
            "编曲": s.get("arranger") or "",
            "監製": producer,
            "語種": s.get("language") or "",
        })

    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def write_xlsx(data: dict, path: Path) -> None:
    if openpyxl is None:
        print("openpyxl not available; skip xlsx")
        return
    wb = Workbook()
    # Songs
    ws = wb.active
    ws.title = "Songs"
    headers = [
        "song_id", "title", "title_english", "album", "release_year",
        "lyricist", "composer", "arranger", "notes", "is_other_artist", "language",
    ]
    ws.append(headers)
    for s in data["songs"]:
        ws.append([
            s.get("song_id"),
            s.get("title"),
            s.get("title_english") or "",
            s.get("album") or "",
            s.get("release_year"),
            s.get("lyricist") or "",
            s.get("composer") or "",
            s.get("arranger") or "",
            s.get("notes") or "",
            bool(s.get("is_other_artist")),
            s.get("language") or "",
        ])

    ws_c = wb.create_sheet("Concerts")
    ws_c.append(["concert_id", "concert_name", "concert_name_english", "notes"])
    for c in data["concerts"]:
        ws_c.append([
            c.get("concert_id"),
            c.get("concert_name"),
            c.get("concert_name_english") or "",
            c.get("notes") or "",
        ])

    ws_s = wb.create_sheet("Sessions")
    ws_s.append(["session_id", "concert_id", "date", "city", "country", "venue"])
    for c in data["concerts"]:
        for s in c.get("sessions", []):
            ws_s.append([
                s.get("session_id"),
                c.get("concert_id"),
                s.get("date"),
                s.get("city") or "",
                s.get("country") or "",
                s.get("venue") or "",
            ])

    ws_p = wb.create_sheet("Performances")
    ws_p.append(["song_id", "session_id", "is_main_rundown", "notes"])
    for p in data["performances"]:
        ws_p.append([
            p.get("song_id"),
            p.get("session_id"),
            bool(p.get("is_main_rundown", True)),
            p.get("notes") or "",
        ])

    wb.save(path)


def strip_private_fields(songs: list) -> None:
    for s in songs:
        for k in list(s.keys()):
            if k.startswith("_"):
                del s[k]


def main():
    html_arg = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_HTML
    html_path = download_html(html_arg)
    dt = parse_dt(html_path)
    print(f"Parsed DT: {len(dt['songs'])} songs, {len(dt['meta']['topics'])} topics")

    data = json.loads(DATA_JSON.read_text(encoding="utf-8"))
    before = {
        "songs": len(data["songs"]),
        "concerts": len(data["concerts"]),
        "sessions": sum(len(c["sessions"]) for c in data["concerts"]),
        "performances": len(data["performances"]),
        "guoyu": sum(1 for s in data["songs"] if s.get("language") == "國語"),
        "other_artist": sum(1 for s in data["songs"] if s.get("is_other_artist")),
    }

    lc_index = build_lc_song_index(dt)
    song_report = enrich_songs(data["songs"], lc_index)
    concert_report = enrich_concerts_and_performances(data, dt)

    # Write CSV before stripping private fields
    write_csv(data["songs"], CSV_PATH)
    strip_private_fields(data["songs"])

    data["generated_note"] = (
        "Generated from workbook via convert_xlsx_to_json.py; "
        "enriched from elaineyupei/my-live-chart (Traditional Chinese DT)"
    )
    DATA_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_xlsx(data, XLSX_PATH)

    after = {
        "songs": len(data["songs"]),
        "concerts": len(data["concerts"]),
        "sessions": sum(len(c["sessions"]) for c in data["concerts"]),
        "performances": len(data["performances"]),
        "guoyu": sum(1 for s in data["songs"] if s.get("language") == "國語"),
        "other_artist": sum(1 for s in data["songs"] if s.get("is_other_artist")),
    }

    # Verify JSON loads
    json.loads(DATA_JSON.read_text(encoding="utf-8"))

    report = {
        "before": before,
        "after": after,
        "song_stats": song_report["stats"],
        "concert_stats": concert_report["stats"],
        "notable_corrections": song_report["corrections"][:40],
        "concerts_added": concert_report["notes"][:30],
    }
    report_path = ROOT / "scripts" / "enrich_from_live_chart_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\nWrote {DATA_JSON}, {CSV_PATH}, {XLSX_PATH}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
