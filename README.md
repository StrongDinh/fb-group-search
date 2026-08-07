# FB Group Search

Bookmarklet quét bài viết Facebook Group, tìm khách hàng tiềm năng.

## Cài đặt cho người dùng cuối

1. Mở `public/index.html` (hoặc deploy lên GitHub Pages)
2. Kéo nút **"🔍 Quét Group"** lên thanh Bookmarks
3. Vào Facebook group bất kỳ → click bookmark → nhập từ khoá → có kết quả

## Dev

```bash
npm install
npm run build    # Build bookmarklet → public/
npm run dev      # Serve local để test
```

## Cấu trúc

```
src/bookmarklet.ts   # Logic chính (scrape + filter + extract + export)
scripts/build.ts     # Bundle + minify + generate index.html
public/              # Output: bookmarklet.js + index.html
```
