# Miriam Yeung Song & Setlist Archive

A tiny static web app: song search + performance history, and a "want to hear
live again" likes ranking. No build step — plain HTML/CSS/JS — so it can be
hosted for free and updated by editing one Excel file.

## 1. Structure

```
app/
  index.html          Main page: song search + performance history
  ranking.html         Likes ranking page
  css/styles.css       Light-purple theme
  js/
    config.js          Supabase URL/key (fill in, see step 3)
    data.js             Loads data.json, builds grouped history + "time since"
    likes.js             Anonymous device-id + Supabase-backed likes
    main.js / ranking.js  Page rendering
  data/data.json        Generated from your Excel workbook (placeholder data included)
  scripts/
    convert_xlsx_to_json.py   Excel -> data.json converter
```

## 2. Updating song / concert / setlist data

1. Edit `miriam_yeung_data_template.xlsx` (the workbook you were given) — add
   rows to Songs / Concerts / Sessions / Performances as needed.
2. Run:
   ```bash
   python3 scripts/convert_xlsx_to_json.py /path/to/your_workbook.xlsx
   ```
   This overwrites `data/data.json`.
3. Commit and push. If your host is connected to your git repo (Cloudflare
   Pages / Vercel / GitHub Pages all support this), the live site updates
   automatically in under a minute. No code changes ever needed.

You only need Python + `openpyxl` installed locally to run the converter
(`pip install openpyxl`).

## 3. Hosting so it actually works from mainland China

Cloudflare Pages, Vercel, and Netlify all have **no servers inside mainland
China**, so the Great Firewall routes around them unpredictably — sites on
them are often slow, or fail to load some assets, or time out entirely for
mainland visitors. Supabase has the same problem (it's hosted abroad, no
China points of presence). None of these are reliable for a China-based
audience, even though they work fine from outside China.

**What this app now uses instead: Tencent CloudBase (腾讯云开发).** It's a
single console that gives you static hosting (via COS + CDN, with real
mainland China nodes), a database, and anonymous auth — all in one place, no
mixing of providers, and no ICP (备案) license needed as long as you use the
free default `*.tcloudbaseapp.com` domain instead of your own custom domain.
It has a genuinely free tier (3,000 resource points/month), which is plenty
for a personal fan site.

### 3a. Create the environment

1. Sign up / log in at https://tcb.cloud.tencent.com (phone or email + real-name verification, standard for any Tencent Cloud account).
2. Click **新建环境 (New environment)** → choose the **免费体验版 (free trial)** tier.
3. Note the **环境 ID (Environment ID)** shown in the console — you'll need it in step 3c.

### 3b. Turn on anonymous login and the database

1. In the environment, go to **登录授权 (Login methods)** and turn **匿名登录 (Anonymous login)** ON.
2. Still under login methods, add this site's domain (your `*.tcloudbaseapp.com` domain, or `localhost` while testing) to the **Web 安全域名 (Web security domains)** allowlist — CloudBase rejects calls from domains not on this list.
3. Go to **数据库 (Database)** → **新建集合 (New collection)** → name it exactly `likes`.
4. Open the collection's **权限设置 (Permissions)** and choose **自定义安全规则 (Custom security rules)**, then paste:
   ```json
   {
     "read": true,
     "create": "auth != null",
     "update": false,
     "delete": false
   }
   ```
   This mirrors what a Postgres RLS policy would do: anyone can read the
   counts, any signed-in (including anonymous) visitor can create a like,
   and nobody can edit or delete an existing one from the client.

### 3c. Point the app at your environment

Edit `js/config.js`:
```js
window.APP_CONFIG = {
  CLOUDBASE_ENV_ID: "your-actual-env-id",
};
```

### 3d. Deploy the static files

Easiest path — no CLI needed:
1. In the console, go to **静态网站托管 (Static website hosting)** → enable it.
2. Upload everything inside this `app/` folder (drag-and-drop works) to the root of the hosting bucket.
3. Your site is live at the `*.tcloudbaseapp.com` domain shown there — no ICP filing required for that domain.

(If you're comfortable with a terminal, `npm i -g @cloudbase/cli`, `tcb login`, then `tcb hosting deploy ./app /` redeploys with one command — handy once you're updating data regularly.)

**Why the SDK is bundled locally instead of loaded from a CDN
(`js/vendor/cloudbase.bundle.js`):** general-purpose JS CDNs like unpkg are
themselves hit-or-miss from mainland China, which would defeat the point.
Bundling it into the app means the only network dependency left is Tencent's
own infrastructure.

**How "one user, one like per song" is enforced:** each visitor gets an
anonymous CloudBase identity on first visit (persisted in the browser, no
login screen). The like is stored with a document ID built from
`songId + deviceId`; CloudBase's database rejects a second insert with the
same ID, so a duplicate like — even from a reload, another tab, or a raw API
call — fails at the database level, not just in the UI. Clearing browser
data or switching devices does start a new anonymous identity, which is the
standard soft limit for any login-free "like" button.

### If you don't need mainland China reach

If your audience is fine with international hosting (e.g. most visitors are
outside China, or you don't mind the occasional slow load), the original
Cloudflare Pages / Vercel + Supabase combination described in earlier
versions of this README works too and is arguably simpler to set up. Swap
`js/likes.js` back to a Supabase client in that case — happy to generate that
version again if you want it.

## 5. Design notes

- Palette: light purple/lavender surfaces on a soft white-purple gradient
  background, with a deep purple for headings and a muted rose for the
  "like" accent.
- Typography: Cormorant Garamond (serif) for song/concert titles, Manrope
  for body text and UI.
- Each concert entry renders as a "ticket stub" (dashed perforation, punch
  holes) — a nod to a physical concert ticket — listing every session
  (date + city/country) under that tour together, most recent first.

## 5b. Data coverage notes (as of the filled workbook shipped with this app)

The workbook was filled in from Wikipedia (zh) and supplementary Chinese-language
sources for the concerts you listed. Coverage varies by concert:

- **Complete / high-confidence:** My concert花樣千嬅演唱會2000, 楊千嬅Minor Classics
  Live, 楊千嬅三二一GO！演唱會, 楊千嬅 Live MY LIVE 2025 演唱會 (opening-night rundown
  applied to all 6 sessions).
- **Partial — single city's setlist applied across sessions, tour had more stops
  than are logged:** 楊千嬅 Let's Begin 世界巡迴演唱會2015 (only the 7 verified Hong
  Kong dates are included; Guangzhou/Macau/Singapore/Foshan/Malaysia stops existed
  but dates weren't reliably confirmed), My Beautiful Live楊千嬅世界巡迴演唱會 (16 of
  the tour's 32 stops are logged, using each city's own setlist where it was found),
  楊千嬅MY TREE OF LIVE世界巡迴演唱會 (only 6 of the tour's 53 stops are logged — this
  was a 21-month, 50+ city tour and full session-by-session data wasn't available).
- **Sparse — only what a news report explicitly named, not a full setlist:**
  楊千嬅 B minor 音樂會, 楊千嬅 RECOLLECTION 澳門演唱會.
- **Concert/session logged, no setlist found:** 楊千嬅 MEET YOU AT THE HALFWAY MINI
  CONCERT 生日限定演唱會, 楊千嬅52Hz Echoes生日限定音樂會.

Everywhere information wasn't reliably available it was left blank rather than
guessed, per your instruction. The `Songs` sheet has titles only — album, year,
lyricist, composer, and arranger were left blank throughout except for a handful
of credits that turned up directly in concert-album liner notes (火鳥, 我的生存之道,
飛女正傳, 可人兒, 我是羊, 木偶奇遇記). Filling in the rest of the Songs sheet will need
a separate pass (e.g. against each song's original album).

## 6. Behavior notes / assumptions made

- **Grouping multiple sessions under one concert card:** all sessions
  sharing a `concert_id` in which a song appears are grouped into a single
  ticket-stub entry, sorted most-recent-first within it. Sessions logged
  with `is_main_rundown = FALSE` (e.g. encore-only, guest segment) are still
  shown in that entry but tagged "Encore" so it's visually distinguishable
  from the main setlist.
- **"Last performed X ago"** is computed from today's date to the most
  recent session date across all of a song's performances, in whole years +
  months.
- **Search** matches song title only (substring, case-insensitive), across
  whatever script you enter titles in.
- **Sort order** on the main page is by each song's most recent performance
  date, most-recent-first, as requested; never-performed songs sort last.
