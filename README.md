# 楊千嬅Live曲目誌

歌迷自發的非官方靜態站：查歌曲演唱會紀錄，以及一些 Fun Facts。

**線上：** https://anchun0409.github.io/miriam-live/

## 頁面

- **歌曲** — 搜尋、篩選（已有／尚未有 Live）、按場次排序、拖曳「自某年後未唱過」
- **Fun Facts** — 場次統計、Top 曲目／城市、Encore 等

點歌曲／演唱會／專輯會開彈窗；歌曲頁的網址可分享（`?song=` / `?concert=` / `?album=`）。

## 本地預覽

不要用 `file://` 直接開（`fetch` 會失敗）。在專案根目錄：

```bash
python3 -m http.server
```

然後開 http://localhost:8000/

## 更新資料

1. 編輯 Excel（如 `miriam_yeung_data_filled.xlsx`）或相關來源
2. 轉成 JSON：

```bash
python3 scripts/convert_xlsx_to_json.py /path/to/workbook.xlsx
```

需要：`pip install openpyxl`

3. Commit + push 到 `main`；GitHub Pages 會自動更新。每次 push 也會戳記 footer 的「最後更新」日期。

## 結構（簡要）

```
index.html / funfacts.html
css/styles.css
js/data.js, main.js, funfacts.js, overlay.js
data/data.json
scripts/convert_xlsx_to_json.py
```

## 致謝

資料整理特別感謝羽佩、Frankie 與其他歌迷分享的 rundown。設計與維護：anchun。
