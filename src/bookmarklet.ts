// ── Configuration ──
const DEFAULT_KEYWORDS = [
  "cần tìm", "cần thuê", "cần mặt bằng",
  "cho thuê", "sang nhượng", "cần sang",
  "tìm mặt bằng", "thuê mặt bằng",
];

const PHONE_REGEX = /(0[3|5|7|8|9]\d{8})|(\+84\d{9,10})/g;
const SCROLL_PAUSE = 1500; // ms giữa mỗi lần scroll
const MAX_SCROLLS = 30; // số lần scroll tối đa

// ── Utilities ──
function extractPhones(text: string): string[] {
  const phones: string[] = [];
  let match;
  while ((match = PHONE_REGEX.exec(text)) !== null) {
    phones.push(match[0]);
  }
  // Dedup
  return [...new Set(phones)];
}

function normalizeKeyword(kw: string): string {
  return kw.toLowerCase().trim();
}

function hasKeywordMatch(text: string, keywords: string[]): string | null {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(normalizeKeyword(kw))) return kw;
  }
  return null;
}

// ── DOM Scraper ──
function scrapePosts(): ScrapedPost[] {
  // Facebook renders posts in various containers. Try multiple selectors.
  const selectors = [
    '[role="article"]',
    '[data-pagelet^="GroupFeed"] [role="article"]',
    'div[class*="x1yztbdb"]', // generic feed container
  ];

  let articles: NodeListOf<Element> | null = null;
  for (const sel of selectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > 5) { articles = found; break; }
  }
  if (!articles || articles.length === 0) {
    // Fallback: find by common FB post structure
    articles = document.querySelectorAll('div[data-ad-comet-preview="message"]');
    if (articles.length === 0) {
      return [];
    }
  }

  const seen = new Set<string>();
  const posts: ScrapedPost[] = [];

  for (const article of articles) {
    try {
      // ── Find post permalink (click on timestamp) ──
      let permalink = "";
      const timeLinks = article.querySelectorAll('a[href]');
      for (const a of timeLinks) {
        const href = a.getAttribute("href") || "";
        // FB post links contain /posts/ or /permalink/ or /story.php
        if (href.includes("/posts/") || href.includes("/permalink/") || href.includes("/story.php")) {
          const span = a.querySelector("span");
          if (span) {
            permalink = href.startsWith("http") ? href : "https://www.facebook.com" + href.split("?")[0];
            break;
          }
        }
      }
      // Fallback: any long href with /posts/
      if (!permalink) {
        for (const a of timeLinks) {
          const href = a.getAttribute("href") || "";
          if (href.includes("/posts/") || href.includes("/permalink/")) {
            permalink = href.startsWith("http") ? href : "https://www.facebook.com" + href.split("?")[0];
            break;
          }
        }
      }

      if (!permalink || seen.has(permalink)) continue;
      seen.add(permalink);

      // ── Find author ──
      let authorName = "";
      let authorProfile = "";
      const headingLinks = article.querySelectorAll(
        'h2 a[href], h3 a[href], h4 a[href], strong a[href], span a[href]'
      );
      for (const a of headingLinks) {
        const text = (a.textContent || "").trim();
        const href = a.getAttribute("href") || "";
        // Skip if it looks like a group link or date
        if (href.includes("/groups/") || href.includes("/posts/") || href.includes("/permalink/")) continue;
        if (text.length > 0 && text.length < 60) {
          authorName = text;
          authorProfile = href.startsWith("http") ? href : "https://www.facebook.com" + href.split("?")[0];
          break;
        }
      }

      // ── Find content text ──
      const contentDivs = article.querySelectorAll(
        'div[dir="auto"], div[data-ad-comet-preview="message"], div[class*="xdj266r"]'
      );
      let content = "";
      for (const div of contentDivs) {
        const t = (div.textContent || "").trim();
        if (t.length > content.length) content = t;
      }
      if (!content) {
        content = (article.textContent || "").trim();
      }

      // ── Find time ──
      let time = "";
      for (const span of article.querySelectorAll("span")) {
        const t = span.textContent?.trim() || "";
        // Facebook time format: "X giờ", "X phút", "X ngày", "tháng X lúc Y"
        if (
          /\d+\s*(giờ|phút|ngày|tuần|tháng|năm|hours?|mins?|days?|weeks?|months?|years?|ago)/i.test(t) ||
          /\d+\s+tháng\s+\d+/i.test(t)
        ) {
          time = t;
          break;
        }
      }

      if (!content || content.length < 10) continue;

      posts.push({ authorName, authorProfile, permalink, content, time });
    } catch {
      // Skip broken posts
    }
  }

  return posts;
}

interface ScrapedPost {
  authorName: string;
  authorProfile: string;
  permalink: string;
  content: string;
  time: string;
}

interface MatchResult {
  keyword: string;
  authorName: string;
  authorProfile: string;
  permalink: string;
  phones: string[];
  content: string;
  time: string;
}

// ── Main ──

async function main() {
  // ── Check we're on a Facebook group page ──
  if (!window.location.href.includes("facebook.com/groups/")) {
    alert("⚠️ Vui lòng mở 1 Facebook group trước, sau đó click lại bookmarklet.");
    return;
  }

  // ── Prompt for keywords ──
  const kwInput = prompt(
    "🔍 Nhập từ khoá (phân cách bởi dấu phẩy):\n\nBỏ trống để dùng mặc định: " + DEFAULT_KEYWORDS.join(", "),
    DEFAULT_KEYWORDS.join(", ")
  );
  if (kwInput === null) return; // user cancelled
  const keywords = kwInput
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  if (keywords.length === 0) {
    alert("⚠️ Vui lòng nhập ít nhất 1 từ khoá.");
    return;
  }

  // ── Show overlay ──
  const overlay = createOverlay();
  updateProgress(overlay, `Đang quét... (0 bài)`);

  // ── Scroll to load posts ──
  let scrollCount = 0;
  const totalBefore = scrapePosts().length;

  while (scrollCount < MAX_SCROLLS) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(SCROLL_PAUSE);
    scrollCount++;
    updateProgress(overlay, `Đang tải thêm bài... (scroll ${scrollCount}/${MAX_SCROLLS})`);
  }

  // ── Scrape ──
  updateProgress(overlay, "Đang quét bài viết...");
  const posts = scrapePosts();

  // ── Filter & extract ──
  updateProgress(overlay, `Đang lọc ${posts.length} bài viết...`);
  const results: MatchResult[] = [];

  for (const post of posts) {
    const matchedKw = hasKeywordMatch(post.content, keywords);
    if (!matchedKw) continue;

    const phones = extractPhones(post.content);

    // Also try to find phone in "See more" text that might be hidden
    const fullText = post.content;

    results.push({
      keyword: matchedKw,
      authorName: post.authorName || "(không rõ)",
      authorProfile: post.authorProfile || "",
      permalink: post.permalink || "",
      phones: extractPhones(fullText), // re-extract on full text
      content: fullText.slice(0, 300),
      time: post.time || "",
    });
  }

  // ── Render results ──
  renderResults(overlay, results, keywords);
}

// ── Overlay UI ──

function createOverlay(): HTMLDivElement {
  // Remove existing overlay
  const existing = document.getElementById("fb-search-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "fb-search-overlay";
  overlay.style.cssText = `
    position: fixed; top: 0; right: 0; width: 460px; height: 100vh;
    background: #fff; z-index: 999999; box-shadow: -4px 0 20px rgba(0,0,0,0.2);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; overflow: hidden;
  `;

  // Header
  const header = document.createElement("div");
  header.id = "fb-search-header";
  header.style.cssText = `
    padding: 12px 16px; background: #1877f2; color: #fff;
    font-weight: 700; font-size: 15px;
    display: flex; justify-content: space-between; align-items: center;
  `;
  header.innerHTML = `<span>📋 Kết quả quét</span><span id="fb-search-close" style="cursor:pointer;font-size:20px;">✕</span>`;
  overlay.appendChild(header);

  // Body (scrollable)
  const body = document.createElement("div");
  body.id = "fb-search-body";
  body.style.cssText = "flex:1; overflow-y: auto; padding: 8px;";
  overlay.appendChild(body);

  // Footer
  const footer = document.createElement("div");
  footer.id = "fb-search-footer";
  footer.style.cssText = `
    padding: 12px 16px; border-top: 1px solid #eee; text-align: center;
    font-size: 13px; color: #65676b;
  `;
  overlay.appendChild(footer);

  document.body.appendChild(overlay);

  // Close button
  document.getElementById("fb-search-close")!.onclick = () => overlay.remove();

  return overlay;
}

function updateProgress(overlay: HTMLDivElement, msg: string) {
  const body = overlay.querySelector("#fb-search-body")!;
  body.innerHTML = `<div style="text-align:center;padding:40px;color:#65676b;">
    <div style="font-size:32px;margin-bottom:12px;">⏳</div>
    <div>${msg}</div>
  </div>`;
}

function renderResults(overlay: HTMLDivElement, results: MatchResult[], keywords: string[]) {
  const body = overlay.querySelector("#fb-search-body")!;
  const footer = overlay.querySelector("#fb-search-footer")!;

  if (results.length === 0) {
    body.innerHTML = `<div style="text-align:center;padding:40px;color:#65676b;">
      <div style="font-size:32px;margin-bottom:12px;">😕</div>
      <div>Không tìm thấy bài nào khớp với từ khoá đã nhập.</div>
      <div style="margin-top:8px;font-size:12px;">Từ khoá: ${keywords.join(", ")}</div>
    </div>`;
    footer.innerHTML = `<button id="fb-search-retry" style="
      padding:8px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;
      cursor:pointer;font-size:14px;font-weight:600;">🔄 Thử lại với từ khoá khác</button>
      <button id="fb-search-close-btn" style="
      padding:8px 24px;background:#e4e6eb;color:#333;border:none;border-radius:6px;
      cursor:pointer;font-size:14px;margin-left:8px;">Đóng</button>`;
    document.getElementById("fb-search-retry")!.onclick = () => { overlay.remove(); main(); };
    document.getElementById("fb-search-close-btn")!.onclick = () => overlay.remove();
    return;
  }

  // Build table
  let html = `<div style="font-weight:700;margin-bottom:8px;font-size:13px;padding:4px 8px;">
    🔍 Từ khoá: ${keywords.join(", ")} | 📊 Tìm thấy <span style="color:#1877f2;">${results.length}</span> kết quả
  </div>`;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    html += `
    <div style="border:1px solid #e4e6eb;border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px;">
      <div style="font-weight:700;color:#1877f2;margin-bottom:4px;">#${i + 1} · ${escapeHtml(r.keyword)}</div>
      <div style="margin-bottom:2px;">👤 <strong>${escapeHtml(r.authorName)}</strong></div>
      ${r.authorProfile ? `<div style="margin-bottom:2px;">🔗 <a href="${r.authorProfile}" target="_blank" style="color:#1877f2;">${r.authorProfile}</a></div>` : ""}
      ${r.phones.length > 0 ? `<div style="margin-bottom:2px;">📞 ${r.phones.map(p => `<span style="background:#e7f3ff;padding:1px 6px;border-radius:4px;margin-right:4px;">${p}</span>`).join(" ")}</div>` : `<div style="margin-bottom:2px;color:#ccc;">📞 Không tìm thấy SĐT</div>`}
      <div style="margin-bottom:2px;">📝 ${escapeHtml(r.content.slice(0, 150))}${r.content.length > 150 ? "..." : ""}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
        <span style="color:#65676b;font-size:12px;">${r.time || ""}</span>
        <a href="${r.permalink}" target="_blank" style="color:#1877f2;font-size:12px;text-decoration:none;">Xem bài viết →</a>
      </div>
    </div>`;
  }

  body.innerHTML = html;

  // Footer: download Excel button
  footer.innerHTML = `
    <button id="fb-search-download" style="
      padding:10px 24px;background:#42b72a;color:#fff;border:none;border-radius:6px;
      cursor:pointer;font-size:14px;font-weight:600;">📥 Tải Excel</button>
    <button id="fb-search-retry" style="
      padding:10px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;
      cursor:pointer;font-size:14px;font-weight:600;margin-left:8px;">🔄 Quét lại</button>`;

  document.getElementById("fb-search-download")!.onclick = () => downloadExcel(results);
  document.getElementById("fb-search-retry")!.onclick = () => { overlay.remove(); main(); };
}

// ── Excel Export ──

function downloadExcel(results: MatchResult[]) {
  // Generate CSV content (Excel opens CSV fine, and we avoid big lib dependency)
  const BOM = "﻿"; // UTF-8 BOM for Excel to recognize encoding
  const headers = ["STT", "Từ khoá", "Người đăng", "Link Profile", "SĐT", "Link bài viết", "Nội dung", "Thời gian"];
  const rows = results.map((r, i) => [
    (i + 1).toString(),
    r.keyword,
    r.authorName,
    r.authorProfile,
    r.phones.join("; "),
    r.permalink,
    r.content.replace(/[\n\r]+/g, " "),
    r.time,
  ]);

  const csv = BOM + [headers, ...rows].map(row =>
    row.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join(",")
  ).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fb-group-results-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ── Entry ──
main().catch((err) => {
  console.error("fb-group-search error:", err);
  alert("Có lỗi xảy ra. Vui lòng thử lại hoặc refresh trang.");
});
