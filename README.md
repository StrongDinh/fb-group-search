# FB Group Search

Bookmarklet quét bài viết Facebook Group, tìm khách hàng tiềm năng.

## Cài đặt cho người dùng cuối

1. Mở https://strongdinh.github.io/fb-group-search/
2. Kéo nút **"🔍 Quét Group"** lên thanh Bookmarks
3. Vào Facebook group bất kỳ → click bookmark → nhập từ khoá → có kết quả

## Dev

```bash
npm install
npm run build    # Build → docs/
```

## Cấu trúc

```
src/bookmarklet.ts   # Logic chính (scrape + filter + extract + export)
scripts/build.ts     # Bundle + minify + generate index.html
docs/                # Output deploy lên GitHub Pages
```
