import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../src/bookmarklet.ts");
const OUT_DIR = path.resolve(__dirname, "../docs");
const HTML_TEMPLATE = path.resolve(__dirname, "../docs/index.html");

async function build() {
  // Ensure output dir exists
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Bundle & minify with esbuild
  console.log("Building bookmarklet...");
  const result = await esbuild.build({
    entryPoints: [SRC],
    bundle: true,
    minify: true,
    target: "es2017",
    format: "iife",
    write: false,
    outfile: "bookmarklet.js",
  });

  const code = result.outputFiles![0].text;

  // 2. Wrap as bookmarklet
  const bookmarklet = "javascript:(function(){" + code + "})();";
  console.log(`  Bookmarklet size: ${bookmarklet.length} chars`);

  // 3. Write raw bookmarklet file
  fs.writeFileSync(path.join(OUT_DIR, "bookmarklet.js"), bookmarklet);
  console.log("  → docs/bookmarklet.js");

  // 4. Generate index.html
  const html = generateHTML(bookmarklet);
  fs.writeFileSync(HTML_TEMPLATE, html);
  console.log("  → docs/index.html");

  console.log("Done! Open docs/index.html to test.");
}

function generateHTML(bookmarklet: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FB Group Search — Quét bài viết Facebook Group</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f0f2f5; color: #1c1e21; line-height: 1.6;
    }
    .container { max-width: 700px; margin: 0 auto; padding: 40px 20px; }
    .hero {
      background: linear-gradient(135deg, #1877f2 0%, #42b72a 100%);
      color: #fff; padding: 48px 32px; border-radius: 16px;
      text-align: center; margin-bottom: 32px;
    }
    .hero h1 { font-size: 28px; margin-bottom: 8px; }
    .hero p { font-size: 16px; opacity: 0.9; }
    .bookmarklet-box {
      background: #fff; border-radius: 12px; padding: 32px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      text-align: center; margin-bottom: 24px;
    }
    .bookmarklet-box h2 { font-size: 20px; margin-bottom: 16px; }
    .bookmarklet-btn {
      display: inline-block; padding: 16px 40px;
      background: #1877f2; color: #fff; border-radius: 8px;
      font-size: 18px; font-weight: 700; text-decoration: none;
      cursor: grab; box-shadow: 0 4px 12px rgba(24,119,242,0.4);
      transition: transform 0.15s; user-select: none;
    }
    .bookmarklet-btn:hover { transform: scale(1.05); }
    .bookmarklet-btn:active { cursor: grabbing; }
    .drag-hint {
      margin-top: 12px; font-size: 14px; color: #65676b;
    }
    .steps {
      background: #fff; border-radius: 12px; padding: 32px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08); margin-bottom: 24px;
    }
    .steps h2 { font-size: 20px; margin-bottom: 16px; }
    .step { display: flex; align-items: flex-start; margin-bottom: 16px; gap: 12px; }
    .step-num {
      background: #1877f2; color: #fff; width: 28px; height: 28px;
      border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-weight: 700; font-size: 14px;
      flex-shrink: 0;
    }
    .step-content { font-size: 15px; }
    .step-content strong { color: #1877f2; }
    .features {
      background: #fff; border-radius: 12px; padding: 32px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08); margin-bottom: 24px;
    }
    .features h2 { font-size: 20px; margin-bottom: 16px; }
    .features ul { list-style: none; }
    .features li { padding: 8px 0; font-size: 15px; }
    .features li::before { content: "✅ "; }
    footer { text-align: center; font-size: 13px; color: #8a8d91; padding: 24px 0; }
    .video-hint {
      margin-top: 16px; padding: 12px; background: #fffbe6;
      border: 1px solid #f5d23e; border-radius: 8px; font-size: 13px;
    }
    .video-hint strong { color: #e67e22; }
    @media (max-width: 480px) {
      .hero { padding: 32px 20px; }
      .hero h1 { font-size: 22px; }
    }
  </style>
</head>
<body>
  <div class="container">

    <!-- Hero -->
    <div class="hero">
      <h1>🔍 FB Group Search</h1>
      <p>Quét bài viết Facebook Group, tìm khách hàng tiềm năng tự động</p>
    </div>

    <!-- Bookmarklet -->
    <div class="bookmarklet-box">
      <h2>👉 Kéo nút này lên thanh Bookmarks</h2>
      <a class="bookmarklet-btn" href="${bookmarklet}" onclick="return false;">
        🔍 Quét Group
      </a>
      <div class="drag-hint">
        🖱️ <strong>Click giữ & kéo thả</strong> nút này lên thanh dấu trang (bookmarks bar) của trình duyệt
      </div>
      <div class="video-hint">
        <strong>💡 Nếu chưa thấy thanh Bookmarks:</strong><br>
        • Chrome: Nhấn <strong>Ctrl+Shift+B</strong> (Windows) hoặc <strong>Cmd+Shift+B</strong> (Mac)<br>
        • Edge: Nhấn <strong>Ctrl+Shift+B</strong><br>
        • Safari: Vào View → Show Favorites Bar
      </div>
    </div>

    <!-- How to use -->
    <div class="steps">
      <h2>📖 Cách sử dụng (chỉ 3 bước)</h2>

      <div class="step">
        <div class="step-num">1</div>
        <div class="step-content">
          <strong>Kéo nút "Quét Group" lên Bookmarks Bar</strong><br>
          (chỉ cần làm 1 lần duy nhất)
        </div>
      </div>

      <div class="step">
        <div class="step-num">2</div>
        <div class="step-content">
          <strong>Mở Facebook Group</strong> bất kỳ mà bạn là thành viên<br>
          Ví dụ: group thuê mặt bằng, group bất động sản, group mua bán...
        </div>
      </div>

      <div class="step">
        <div class="step-num">3</div>
        <div class="step-content">
          <strong>Click vào bookmark "Quét Group"</strong><br>
          Nhập từ khoá (vd: cần thuê, cần tìm, sang nhượng...) → tool tự quét & hiện kết quả!
        </div>
      </div>
    </div>

    <!-- Features -->
    <div class="features">
      <h2>✨ Tính năng</h2>
      <ul>
        <li>Quét tất cả bài viết đang hiển thị trong group</li>
        <li>Lọc bài theo từ khoá bạn nhập (hỗ trợ nhiều từ khoá)</li>
        <li>Tự động trích xuất <strong>số điện thoại</strong> từ nội dung bài viết</li>
        <li>Lấy <strong>link profile</strong> người đăng</li>
        <li>Lấy <strong>link bài viết</strong> gốc</li>
        <li>Xuất kết quả ra <strong>file Excel (.csv)</strong></li>
        <li>Popup hiển thị ngay trên Facebook, không rời trang</li>
        <li>Không cần cài đặt, không cần tài khoản, không cần token</li>
      </ul>
    </div>

    <footer>
      FB Group Search — Công cụ miễn phí · Mã nguồn trên GitHub
    </footer>
  </div>
</body>
</html>`;
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
