// Copy đoạn code này, paste vào Console (F12) khi đang ở Facebook Group
(function () {
  "use strict";

  const DEFAULT_KEYWORDS = [
    "cần tìm", "cần thuê", "cần mặt bằng",
    "cho thuê", "sang nhượng", "cần sang",
    "tìm mặt bằng", "thuê mặt bằng",
  ];

  const PHONE_REGEX = /(0[3|5|7|8|9]\d{8})|(\+84\d{9,10})/g;
  const SCROLL_PAUSE = 1500;
  const MAX_SCROLLS = 30;

  function extractPhones(text) {
    const phones = [];
    let match;
    while ((match = PHONE_REGEX.exec(text)) !== null) phones.push(match[0]);
    return [...new Set(phones)];
  }

  function hasKeywordMatch(text, keywords) {
    const lower = text.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase().trim())) return kw;
    }
    return null;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  function scrapePosts() {
    const articles = document.querySelectorAll('[role="article"]');
    const seen = new Set();
    const posts = [];
    for (const article of articles) {
      try {
        let permalink = "";
        for (const a of article.querySelectorAll("a[href]")) {
          const href = a.getAttribute("href") || "";
          if ((href.includes("/posts/") || href.includes("/permalink/") || href.includes("/story.php")) && !href.includes("__cft__")) {
            permalink = href.startsWith("http") ? href.split("?")[0] : "https://www.facebook.com" + href.split("?")[0];
            break;
          }
        }
        if (!permalink || seen.has(permalink)) continue;
        seen.add(permalink);

        let authorName = "", authorProfile = "";
        for (const a of article.querySelectorAll("h2 a[href], h3 a[href], h4 a[href], strong a[href], span a[role='link']")) {
          const text = (a.textContent || "").trim(), href = a.getAttribute("href") || "";
          if (href.includes("/groups/") || href.includes("/posts/") || href.includes("/permalink/")) continue;
          if (text.length > 0 && text.length < 60) {
            authorName = text;
            authorProfile = href.startsWith("http") ? href : "https://www.facebook.com" + href.split("?")[0];
            break;
          }
        }
        if (!authorName) {
          const al = article.querySelector('a[aria-label]');
          if (al) { authorName = al.getAttribute("aria-label") || ""; authorProfile = (al.getAttribute("href") || "").split("?")[0]; }
        }

        let content = "";
        for (const div of article.querySelectorAll('div[dir="auto"], div[data-ad-comet-preview="message"]')) {
          const t = (div.textContent || "").trim();
          if (t.length > content.length) content = t;
        }
        if (!content || content.length < 10) continue;

        let time = "";
        for (const span of article.querySelectorAll("span")) {
          const t = span.textContent?.trim() || "";
          if (/\d+\s*(giờ|phút|ngày|tuần|tháng|năm|hours?|mins?|days?|weeks?|months?|years?|ago)/i.test(t)) { time = t; break; }
        }
        posts.push({ authorName, authorProfile, permalink, content, time });
      } catch(e) {}
    }
    return posts;
  }

  // ── Overlay ──
  function removeOverlay() {
    document.getElementById("fbgs-overlay")?.remove();
  }

  function createOverlay() {
    removeOverlay();
    const ov = document.createElement("div");
    ov.id = "fbgs-overlay";
    ov.style.cssText = "position:fixed;top:0;right:0;width:460px;height:100vh;background:#fff;z-index:999999;box-shadow:-4px 0 20px rgba(0,0,0,0.2);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:flex;flex-direction:column;overflow:hidden;";
    const hdr = document.createElement("div");
    hdr.style.cssText = "padding:12px 16px;background:#1877f2;color:#fff;font-weight:700;font-size:15px;display:flex;justify-content:space-between;align-items:center;";
    hdr.innerHTML = '<span>📋 Kết quả quét</span><span id="fbgs-close" style="cursor:pointer;font-size:20px;">✕</span>';
    ov.appendChild(hdr);
    const body = document.createElement("div");
    body.id = "fbgs-body";
    body.style.cssText = "flex:1;overflow-y:auto;padding:8px;";
    ov.appendChild(body);
    const ft = document.createElement("div");
    ft.id = "fbgs-footer";
    ft.style.cssText = "padding:12px 16px;border-top:1px solid #eee;text-align:center;font-size:13px;color:#65676b;";
    ov.appendChild(ft);
    document.body.appendChild(ov);
    document.getElementById("fbgs-close").onclick = removeOverlay;
    return ov;
  }

  function progress(ov, msg) {
    ov.querySelector("#fbgs-body").innerHTML = '<div style="text-align:center;padding:40px;color:#65676b;"><div style="font-size:32px;margin-bottom:12px;">⏳</div><div>' + msg + '</div></div>';
  }

  function render(ov, results, keywords) {
    const body = ov.querySelector("#fbgs-body");
    const ft = ov.querySelector("#fbgs-footer");
    if (results.length === 0) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#65676b;"><div style="font-size:32px;margin-bottom:12px;">😕</div><div>Không tìm thấy bài nào khớp.</div><div style="margin-top:8px;font-size:12px;">Từ khoá: ' + keywords.join(", ") + '</div></div>';
      ft.innerHTML = '<button id="fbgs-retry" style="padding:8px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">🔄 Thử lại</button><button id="fbgs-close-btn" style="padding:8px 24px;background:#e4e6eb;color:#333;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin-left:8px;">Đóng</button>';
      document.getElementById("fbgs-retry").onclick = function() { removeOverlay(); run(); };
      document.getElementById("fbgs-close-btn").onclick = removeOverlay;
      return;
    }
    let html = '<div style="font-weight:700;margin-bottom:8px;font-size:13px;padding:4px 8px;">🔍 Từ khoá: ' + keywords.join(", ") + ' | 📊 <span style="color:#1877f2;">' + results.length + '</span> kết quả</div>';
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      html += '<div style="border:1px solid #e4e6eb;border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px;">';
      html += '<div style="font-weight:700;color:#1877f2;margin-bottom:4px;">#' + (i+1) + ' · ' + esc(r.keyword) + '</div>';
      html += '<div style="margin-bottom:2px;">👤 <strong>' + esc(r.authorName) + '</strong></div>';
      if (r.authorProfile) html += '<div style="margin-bottom:2px;">🔗 <a href="' + r.authorProfile + '" target="_blank" style="color:#1877f2;">' + r.authorProfile + '</a></div>';
      if (r.phones.length > 0) {
        html += '<div style="margin-bottom:2px;">📞 ' + r.phones.map(function(p) { return '<span style="background:#e7f3ff;padding:1px 6px;border-radius:4px;margin-right:4px;">' + p + '</span>'; }).join(" ") + '</div>';
      } else {
        html += '<div style="margin-bottom:2px;color:#ccc;">📞 Không có SĐT</div>';
      }
      html += '<div style="margin-bottom:2px;">📝 ' + esc(r.content.slice(0, 150)) + (r.content.length > 150 ? "..." : "") + '</div>';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">';
      html += '<span style="color:#65676b;font-size:12px;">' + (r.time || "") + '</span>';
      html += '<a href="' + r.permalink + '" target="_blank" style="color:#1877f2;font-size:12px;text-decoration:none;">Xem bài viết →</a></div></div>';
    }
    body.innerHTML = html;
    ft.innerHTML = '<button id="fbgs-dl" style="padding:10px 24px;background:#42b72a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">📥 Tải Excel</button><button id="fbgs-retry" style="padding:10px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;margin-left:8px;">🔄 Quét lại</button>';
    document.getElementById("fbgs-dl").onclick = function() {
      const BOM = "﻿";
      const headers = ["STT","Từ khoá","Người đăng","Link Profile","SĐT","Link bài viết","Nội dung","Thời gian"];
      const rows = results.map(function(r, i) {
        return [(i+1).toString(), r.keyword, r.authorName, r.authorProfile, r.phones.join("; "), r.permalink, r.content.replace(/[\n\r]+/g," "), r.time];
      });
      const csv = BOM + [headers].concat(rows).map(function(row) { return row.map(function(c) { return '"' + ((c||"").replace(/"/g,'""')) + '"'; }).join(","); }).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "fb-group-results-" + new Date().toISOString().slice(0,10) + ".csv"; a.click();
      URL.revokeObjectURL(url);
    };
    document.getElementById("fbgs-retry").onclick = function() { removeOverlay(); run(); };
  }

  async function run() {
    const kwInput = prompt(
      "🔍 Nhập từ khoá (phân cách bởi dấu phẩy):\n\nBỏ trống để dùng mặc định: " + DEFAULT_KEYWORDS.join(", "),
      DEFAULT_KEYWORDS.join(", ")
    );
    if (kwInput === null) return;
    const keywords = kwInput.split(",").map(function(k) { return k.trim(); }).filter(function(k) { return k.length > 0; });
    if (keywords.length === 0) { alert("⚠️ Vui lòng nhập ít nhất 1 từ khoá."); return; }

    const ov = createOverlay();
    progress(ov, "Đang quét... (0 bài)");

    for (let i = 0; i < MAX_SCROLLS; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(SCROLL_PAUSE);
      progress(ov, "Đang tải thêm bài... (" + (i+1) + "/" + MAX_SCROLLS + ")");
    }

    progress(ov, "Đang quét bài viết...");
    const posts = scrapePosts();

    progress(ov, "Đang lọc " + posts.length + " bài...");
    const results = [];
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
    render(ov, results, keywords);
  }

  if (!window.location.pathname.includes("/groups/")) {
    alert("⚠️ Vui lòng mở 1 Facebook group trước, sau đó chạy lại.");
  } else {
    run();
  }
})();
