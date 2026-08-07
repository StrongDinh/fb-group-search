// ==UserScript==
// @name         FB Group Search - Quét bài viết Facebook Group
// @namespace    https://strongdinh.github.io/fb-group-search/
// @version      1.1
// @description  Quét bài viết Facebook Group, lọc theo từ khoá, trích xuất SĐT & link
// @author       StrongDinh
// @match        https://www.facebook.com/*
// @match        https://web.facebook.com/*
// @match        https://*.facebook.com/*
// @include      /^https?:\/\/(www\.|web\.|mbasic\.)?facebook\.com\/.*/
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
  console.log("%c[FB Group Search] Script loaded!", "color: green; font-size: 16px; font-weight: bold;");
  console.log("[FB Group Search] Current URL:", window.location.href);

  // ── Configuration ──
  const DEFAULT_KEYWORDS = [
    "cần tìm", "cần thuê", "cần mặt bằng",
    "cho thuê", "sang nhượng", "cần sang",
    "tìm mặt bằng", "thuê mặt bằng",
  ];

  const PHONE_REGEX = /(0[3|5|7|8|9]\d{8})|(\+84\d{9,10})/g;
  const SCROLL_PAUSE = 1500;
  const MAX_SCROLLS = 30;

  // ── Utilities ──
  function extractPhones(text: string): string[] {
    const phones: string[] = [];
    let match;
    while ((match = PHONE_REGEX.exec(text)) !== null) {
      phones.push(match[0]);
    }
    return [...new Set(phones)];
  }

  function hasKeywordMatch(text: string, keywords: string[]): string | null {
    const lower = text.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase().trim())) return kw;
    }
    return null;
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  function escapeHtml(s: string): string {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  // ── DOM Scraper ──
  function scrapePosts(): ScrapedPost[] {
    const articles = document.querySelectorAll('[role="article"]');
    const seen = new Set<string>();
    const posts: ScrapedPost[] = [];

    for (const article of articles) {
      try {
        // Permalink
        let permalink = "";
        const links = article.querySelectorAll("a[href]");
        for (const a of links) {
          const href = a.getAttribute("href") || "";
          if ((href.includes("/posts/") || href.includes("/permalink/") || href.includes("/story.php")) && !href.includes("__cft__")) {
            permalink = href.startsWith("http") ? href.split("?")[0] : "https://www.facebook.com" + href.split("?")[0];
            break;
          }
        }
        if (!permalink || seen.has(permalink)) continue;
        seen.add(permalink);

        // Author
        let authorName = "";
        let authorProfile = "";
        for (const a of article.querySelectorAll("h2 a[href], h3 a[href], h4 a[href], strong a[href], span a[role='link']")) {
          const text = (a.textContent || "").trim();
          const href = a.getAttribute("href") || "";
          if (href.includes("/groups/") || href.includes("/posts/") || href.includes("/permalink/")) continue;
          if (text.length > 0 && text.length < 60) {
            authorName = text;
            authorProfile = href.startsWith("http") ? href : "https://www.facebook.com" + href.split("?")[0];
            break;
          }
        }
        if (!authorName) {
          // backup: try aria-label
          const ariaLink = article.querySelector('a[aria-label]');
          if (ariaLink) {
            authorName = ariaLink.getAttribute("aria-label") || "";
            authorProfile = (ariaLink.getAttribute("href") || "").split("?")[0];
          }
        }

        // Content
        const contentDivs = article.querySelectorAll('div[dir="auto"], div[data-ad-comet-preview="message"]');
        let content = "";
        for (const div of contentDivs) {
          const t = (div.textContent || "").trim();
          if (t.length > content.length) content = t;
        }
        if (!content || content.length < 10) continue;

        // Time
        let time = "";
        for (const span of article.querySelectorAll("span")) {
          const t = span.textContent?.trim() || "";
          if (/\d+\s*(giờ|phút|ngày|tuần|tháng|năm|hours?|mins?|days?|weeks?|months?|years?|ago)/i.test(t) || /\d+\s+tháng\s+\d+/i.test(t)) {
            time = t;
            break;
          }
        }

        posts.push({ authorName, authorProfile, permalink, content, time });
      } catch { /* skip broken */ }
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

  // ── Overlay UI ──
  function createOverlay(): HTMLDivElement {
    removeOverlay();
    const overlay = document.createElement("div");
    overlay.id = "fbgs-overlay";
    overlay.style.cssText = `
      position:fixed;top:0;right:0;width:460px;height:100vh;background:#fff;z-index:999999;
      box-shadow:-4px 0 20px rgba(0,0,0,0.2);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      display:flex;flex-direction:column;overflow:hidden;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      padding:12px 16px;background:#1877f2;color:#fff;font-weight:700;font-size:15px;
      display:flex;justify-content:space-between;align-items:center;
    `;
    header.innerHTML = `<span>📋 Kết quả quét</span><span id="fbgs-close" style="cursor:pointer;font-size:20px;">✕</span>`;
    overlay.appendChild(header);

    const body = document.createElement("div");
    body.id = "fbgs-body";
    body.style.cssText = "flex:1;overflow-y:auto;padding:8px;";
    overlay.appendChild(body);

    const footer = document.createElement("div");
    footer.id = "fbgs-footer";
    footer.style.cssText = "padding:12px 16px;border-top:1px solid #eee;text-align:center;font-size:13px;color:#65676b;";
    overlay.appendChild(footer);

    document.body.appendChild(overlay);
    document.getElementById("fbgs-close")!.onclick = removeOverlay;
    return overlay;
  }

  function removeOverlay() {
    document.getElementById("fbgs-overlay")?.remove();
    document.getElementById("fbgs-btn-container")?.remove();
  }

  function updateProgress(overlay: HTMLDivElement, msg: string) {
    const body = overlay.querySelector("#fbgs-body")!;
    body.innerHTML = `<div style="text-align:center;padding:40px;color:#65676b;">
      <div style="font-size:32px;margin-bottom:12px;">⏳</div><div>${msg}</div></div>`;
  }

  function renderResults(overlay: HTMLDivElement, results: MatchResult[], keywords: string[]) {
    const body = overlay.querySelector("#fbgs-body")!;
    const footer = overlay.querySelector("#fbgs-footer")!;

    if (results.length === 0) {
      body.innerHTML = `<div style="text-align:center;padding:40px;color:#65676b;">
        <div style="font-size:32px;margin-bottom:12px;">😕</div>
        <div>Không tìm thấy bài nào khớp.</div>
        <div style="margin-top:8px;font-size:12px;">Từ khoá: ${keywords.join(", ")}</div></div>`;
      footer.innerHTML = `<button id="fbgs-retry" style="padding:8px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">🔄 Thử lại</button>
        <button id="fbgs-close-btn" style="padding:8px 24px;background:#e4e6eb;color:#333;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin-left:8px;">Đóng</button>`;
      document.getElementById("fbgs-retry")!.onclick = () => { removeOverlay(); startScan(); };
      document.getElementById("fbgs-close-btn")!.onclick = removeOverlay;
      return;
    }

    let html = `<div style="font-weight:700;margin-bottom:8px;font-size:13px;padding:4px 8px;">
      🔍 Từ khoá: ${keywords.join(", ")} | 📊 <span style="color:#1877f2;">${results.length}</span> kết quả</div>`;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      html += `<div style="border:1px solid #e4e6eb;border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px;">
        <div style="font-weight:700;color:#1877f2;margin-bottom:4px;">#${i + 1} · ${escapeHtml(r.keyword)}</div>
        <div style="margin-bottom:2px;">👤 <strong>${escapeHtml(r.authorName)}</strong></div>
        ${r.authorProfile ? `<div style="margin-bottom:2px;">🔗 <a href="${r.authorProfile}" target="_blank" style="color:#1877f2;">${r.authorProfile}</a></div>` : ""}
        ${r.phones.length > 0 ? `<div style="margin-bottom:2px;">📞 ${r.phones.map(p => `<span style="background:#e7f3ff;padding:1px 6px;border-radius:4px;margin-right:4px;">${p}</span>`).join(" ")}</div>` : `<div style="margin-bottom:2px;color:#ccc;">📞 Không có SĐT</div>`}
        <div style="margin-bottom:2px;">📝 ${escapeHtml(r.content.slice(0, 150))}${r.content.length > 150 ? "..." : ""}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
          <span style="color:#65676b;font-size:12px;">${r.time || ""}</span>
          <a href="${r.permalink}" target="_blank" style="color:#1877f2;font-size:12px;text-decoration:none;">Xem bài viết →</a></div></div>`;
    }
    body.innerHTML = html;

    footer.innerHTML = `<button id="fbgs-dl" style="padding:10px 24px;background:#42b72a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">📥 Tải Excel</button>
      <button id="fbgs-retry" style="padding:10px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;margin-left:8px;">🔄 Quét lại</button>`;
    document.getElementById("fbgs-dl")!.onclick = () => downloadExcel(results);
    document.getElementById("fbgs-retry")!.onclick = () => { removeOverlay(); startScan(); };
  }

  function downloadExcel(results: MatchResult[]) {
    const BOM = "﻿";
    const headers = ["STT", "Từ khoá", "Người đăng", "Link Profile", "SĐT", "Link bài viết", "Nội dung", "Thời gian"];
    const rows = results.map((r, i) => [
      (i + 1).toString(), r.keyword, r.authorName, r.authorProfile,
      r.phones.join("; "), r.permalink, r.content.replace(/[\n\r]+/g, " "), r.time,
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

  // ── Main scan flow ──
  async function startScan() {
    const kwInput = prompt(
      "🔍 Nhập từ khoá (phân cách bởi dấu phẩy):\n\nBỏ trống để dùng mặc định: " + DEFAULT_KEYWORDS.join(", "),
      DEFAULT_KEYWORDS.join(", ")
    );
    if (kwInput === null) return;

    const keywords = kwInput.split(",").map(k => k.trim()).filter(k => k.length > 0);
    if (keywords.length === 0) {
      alert("⚠️ Vui lòng nhập ít nhất 1 từ khoá.");
      return;
    }

    const overlay = createOverlay();
    updateProgress(overlay, "Đang quét... (0 bài)");

    // Scroll to load
    for (let i = 0; i < MAX_SCROLLS; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(SCROLL_PAUSE);
      updateProgress(overlay, `Đang tải thêm bài... (${i + 1}/${MAX_SCROLLS})`);
    }

    // Scrape
    updateProgress(overlay, "Đang quét bài viết...");
    const posts = scrapePosts();

    // Filter
    updateProgress(overlay, `Đang lọc ${posts.length} bài...`);
    const results: MatchResult[] = [];
    for (const post of posts) {
      const matchedKw = hasKeywordMatch(post.content, keywords);
      if (!matchedKw) continue;
      results.push({
        keyword: matchedKw,
        authorName: post.authorName || "(không rõ)",
        authorProfile: post.authorProfile || "",
        permalink: post.permalink || "",
        phones: extractPhones(post.content),
        content: post.content,
        time: post.time || "",
      });
    }

    renderResults(overlay, results, keywords);
  }

  // ── Floating button ──
  function addFloatingButton() {
    if (document.getElementById("fbgs-btn-container")) return;
    console.log("[FB Group Search] Adding button...");

    // Inject keyframe animation
    if (!document.getElementById("fbgs-style")) {
      const style = document.createElement("style");
      style.id = "fbgs-style";
      style.textContent = "@keyframes fbgs-pulse{0%,100%{box-shadow:0 4px 20px rgba(228,30,63,0.5)}50%{box-shadow:0 4px 30px rgba(228,30,63,0.9)}}";
      document.head.appendChild(style);
    }

    const container = document.createElement("div");
    container.id = "fbgs-btn-container";
    container.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:999998;
    `;
    const btn = document.createElement("button");
    btn.textContent = "🔍 Quét Group";
    btn.style.cssText = `
      padding:14px 28px;background:#e41e3f;color:#fff;border:none;border-radius:24px;
      font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(228,30,63,0.5);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      animation: fbgs-pulse 1.5s ease-in-out infinite;
    `;
    btn.onclick = startScan;
    container.appendChild(btn);
    document.body.appendChild(container);
  }

  // ── Init ──
  function isGroupPage(): boolean {
    return window.location.pathname.includes("/groups/");
  }

  function init() {
    if (isGroupPage() && !document.getElementById("fbgs-btn-container")) {
      addFloatingButton();
    }
    if (!isGroupPage()) {
      // Remove button if navigated away from group
      document.getElementById("fbgs-btn-container")?.remove();
    }
  }

  // Simple polling — most reliable for SPA like Facebook
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init();
      setInterval(init, 2000); // Check every 2 seconds
    });
  } else {
    init();
    setInterval(init, 2000);
  }
})();
