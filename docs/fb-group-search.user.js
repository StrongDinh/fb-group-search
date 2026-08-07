// ==UserScript==
// @name         FB Group Search - Quét bài viết Facebook Group
// @namespace    https://strongdinh.github.io/fb-group-search/
// @version      1.0
// @description  Quét bài viết Facebook Group, lọc theo từ khoá, trích xuất SĐT & link
// @author       StrongDinh
// @match        https://www.facebook.com/groups/*
// @grant        none
// ==/UserScript==
"use strict";
(() => {
  // src/bookmarklet.ts
  (function() {
    "use strict";
    const DEFAULT_KEYWORDS = [
      "c\u1EA7n t\xECm",
      "c\u1EA7n thu\xEA",
      "c\u1EA7n m\u1EB7t b\u1EB1ng",
      "cho thu\xEA",
      "sang nh\u01B0\u1EE3ng",
      "c\u1EA7n sang",
      "t\xECm m\u1EB7t b\u1EB1ng",
      "thu\xEA m\u1EB7t b\u1EB1ng"
    ];
    const PHONE_REGEX = /(0[3|5|7|8|9]\d{8})|(\+84\d{9,10})/g;
    const SCROLL_PAUSE = 1500;
    const MAX_SCROLLS = 30;
    function extractPhones(text) {
      const phones = [];
      let match;
      while ((match = PHONE_REGEX.exec(text)) !== null) {
        phones.push(match[0]);
      }
      return [...new Set(phones)];
    }
    function hasKeywordMatch(text, keywords) {
      const lower = text.toLowerCase();
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase().trim())) return kw;
      }
      return null;
    }
    function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }
    function escapeHtml(s) {
      const div = document.createElement("div");
      div.textContent = s;
      return div.innerHTML;
    }
    function scrapePosts() {
      var _a;
      const articles = document.querySelectorAll('[role="article"]');
      const seen = /* @__PURE__ */ new Set();
      const posts = [];
      for (const article of articles) {
        try {
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
            const ariaLink = article.querySelector("a[aria-label]");
            if (ariaLink) {
              authorName = ariaLink.getAttribute("aria-label") || "";
              authorProfile = (ariaLink.getAttribute("href") || "").split("?")[0];
            }
          }
          const contentDivs = article.querySelectorAll('div[dir="auto"], div[data-ad-comet-preview="message"]');
          let content = "";
          for (const div of contentDivs) {
            const t = (div.textContent || "").trim();
            if (t.length > content.length) content = t;
          }
          if (!content || content.length < 10) continue;
          let time = "";
          for (const span of article.querySelectorAll("span")) {
            const t = ((_a = span.textContent) == null ? void 0 : _a.trim()) || "";
            if (/\d+\s*(giờ|phút|ngày|tuần|tháng|năm|hours?|mins?|days?|weeks?|months?|years?|ago)/i.test(t) || /\d+\s+tháng\s+\d+/i.test(t)) {
              time = t;
              break;
            }
          }
          posts.push({ authorName, authorProfile, permalink, content, time });
        } catch (e) {
        }
      }
      return posts;
    }
    function createOverlay() {
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
      header.innerHTML = `<span>\u{1F4CB} K\u1EBFt qu\u1EA3 qu\xE9t</span><span id="fbgs-close" style="cursor:pointer;font-size:20px;">\u2715</span>`;
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
      document.getElementById("fbgs-close").onclick = removeOverlay;
      return overlay;
    }
    function removeOverlay() {
      var _a, _b;
      (_a = document.getElementById("fbgs-overlay")) == null ? void 0 : _a.remove();
      (_b = document.getElementById("fbgs-btn-container")) == null ? void 0 : _b.remove();
    }
    function updateProgress(overlay, msg) {
      const body = overlay.querySelector("#fbgs-body");
      body.innerHTML = `<div style="text-align:center;padding:40px;color:#65676b;">
      <div style="font-size:32px;margin-bottom:12px;">\u23F3</div><div>${msg}</div></div>`;
    }
    function renderResults(overlay, results, keywords) {
      const body = overlay.querySelector("#fbgs-body");
      const footer = overlay.querySelector("#fbgs-footer");
      if (results.length === 0) {
        body.innerHTML = `<div style="text-align:center;padding:40px;color:#65676b;">
        <div style="font-size:32px;margin-bottom:12px;">\u{1F615}</div>
        <div>Kh\xF4ng t\xECm th\u1EA5y b\xE0i n\xE0o kh\u1EDBp.</div>
        <div style="margin-top:8px;font-size:12px;">T\u1EEB kho\xE1: ${keywords.join(", ")}</div></div>`;
        footer.innerHTML = `<button id="fbgs-retry" style="padding:8px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">\u{1F504} Th\u1EED l\u1EA1i</button>
        <button id="fbgs-close-btn" style="padding:8px 24px;background:#e4e6eb;color:#333;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin-left:8px;">\u0110\xF3ng</button>`;
        document.getElementById("fbgs-retry").onclick = () => {
          removeOverlay();
          startScan();
        };
        document.getElementById("fbgs-close-btn").onclick = removeOverlay;
        return;
      }
      let html = `<div style="font-weight:700;margin-bottom:8px;font-size:13px;padding:4px 8px;">
      \u{1F50D} T\u1EEB kho\xE1: ${keywords.join(", ")} | \u{1F4CA} <span style="color:#1877f2;">${results.length}</span> k\u1EBFt qu\u1EA3</div>`;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        html += `<div style="border:1px solid #e4e6eb;border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px;">
        <div style="font-weight:700;color:#1877f2;margin-bottom:4px;">#${i + 1} \xB7 ${escapeHtml(r.keyword)}</div>
        <div style="margin-bottom:2px;">\u{1F464} <strong>${escapeHtml(r.authorName)}</strong></div>
        ${r.authorProfile ? `<div style="margin-bottom:2px;">\u{1F517} <a href="${r.authorProfile}" target="_blank" style="color:#1877f2;">${r.authorProfile}</a></div>` : ""}
        ${r.phones.length > 0 ? `<div style="margin-bottom:2px;">\u{1F4DE} ${r.phones.map((p) => `<span style="background:#e7f3ff;padding:1px 6px;border-radius:4px;margin-right:4px;">${p}</span>`).join(" ")}</div>` : `<div style="margin-bottom:2px;color:#ccc;">\u{1F4DE} Kh\xF4ng c\xF3 S\u0110T</div>`}
        <div style="margin-bottom:2px;">\u{1F4DD} ${escapeHtml(r.content.slice(0, 150))}${r.content.length > 150 ? "..." : ""}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
          <span style="color:#65676b;font-size:12px;">${r.time || ""}</span>
          <a href="${r.permalink}" target="_blank" style="color:#1877f2;font-size:12px;text-decoration:none;">Xem b\xE0i vi\u1EBFt \u2192</a></div></div>`;
      }
      body.innerHTML = html;
      footer.innerHTML = `<button id="fbgs-dl" style="padding:10px 24px;background:#42b72a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">\u{1F4E5} T\u1EA3i Excel</button>
      <button id="fbgs-retry" style="padding:10px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;margin-left:8px;">\u{1F504} Qu\xE9t l\u1EA1i</button>`;
      document.getElementById("fbgs-dl").onclick = () => downloadExcel(results);
      document.getElementById("fbgs-retry").onclick = () => {
        removeOverlay();
        startScan();
      };
    }
    function downloadExcel(results) {
      const BOM = "\uFEFF";
      const headers = ["STT", "T\u1EEB kho\xE1", "Ng\u01B0\u1EDDi \u0111\u0103ng", "Link Profile", "S\u0110T", "Link b\xE0i vi\u1EBFt", "N\u1ED9i dung", "Th\u1EDDi gian"];
      const rows = results.map((r, i) => [
        (i + 1).toString(),
        r.keyword,
        r.authorName,
        r.authorProfile,
        r.phones.join("; "),
        r.permalink,
        r.content.replace(/[\n\r]+/g, " "),
        r.time
      ]);
      const csv = BOM + [headers, ...rows].map(
        (row) => row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(",")
      ).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fb-group-results-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    async function startScan() {
      const kwInput = prompt(
        "\u{1F50D} Nh\u1EADp t\u1EEB kho\xE1 (ph\xE2n c\xE1ch b\u1EDFi d\u1EA5u ph\u1EA9y):\n\nB\u1ECF tr\u1ED1ng \u0111\u1EC3 d\xF9ng m\u1EB7c \u0111\u1ECBnh: " + DEFAULT_KEYWORDS.join(", "),
        DEFAULT_KEYWORDS.join(", ")
      );
      if (kwInput === null) return;
      const keywords = kwInput.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
      if (keywords.length === 0) {
        alert("\u26A0\uFE0F Vui l\xF2ng nh\u1EADp \xEDt nh\u1EA5t 1 t\u1EEB kho\xE1.");
        return;
      }
      const overlay = createOverlay();
      updateProgress(overlay, "\u0110ang qu\xE9t... (0 b\xE0i)");
      for (let i = 0; i < MAX_SCROLLS; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(SCROLL_PAUSE);
        updateProgress(overlay, `\u0110ang t\u1EA3i th\xEAm b\xE0i... (${i + 1}/${MAX_SCROLLS})`);
      }
      updateProgress(overlay, "\u0110ang qu\xE9t b\xE0i vi\u1EBFt...");
      const posts = scrapePosts();
      updateProgress(overlay, `\u0110ang l\u1ECDc ${posts.length} b\xE0i...`);
      const results = [];
      for (const post of posts) {
        const matchedKw = hasKeywordMatch(post.content, keywords);
        if (!matchedKw) continue;
        results.push({
          keyword: matchedKw,
          authorName: post.authorName || "(kh\xF4ng r\xF5)",
          authorProfile: post.authorProfile || "",
          permalink: post.permalink || "",
          phones: extractPhones(post.content),
          content: post.content,
          time: post.time || ""
        });
      }
      renderResults(overlay, results, keywords);
    }
    function addFloatingButton() {
      const container = document.createElement("div");
      container.id = "fbgs-btn-container";
      container.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:999998;
    `;
      const btn = document.createElement("button");
      btn.textContent = "\u{1F50D} Qu\xE9t Group";
      btn.style.cssText = `
      padding:12px 24px;background:#1877f2;color:#fff;border:none;border-radius:24px;
      font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(24,119,242,0.4);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    `;
      btn.onclick = startScan;
      container.appendChild(btn);
      document.body.appendChild(container);
    }
    let lastPath = "";
    function init() {
      const isGroupPage = window.location.pathname.includes("/groups/");
      if (!isGroupPage) {
        removeOverlay();
        return;
      }
      if (lastPath !== window.location.pathname) {
        lastPath = window.location.pathname;
        if (!document.getElementById("fbgs-btn-container")) {
          addFloatingButton();
        }
      }
    }
    function watchNavigation() {
      const origPush = history.pushState;
      const origReplace = history.replaceState;
      function onNav() {
        setTimeout(init, 500);
      }
      history.pushState = function(...args) {
        origPush.apply(this, args);
        onNav();
      };
      history.replaceState = function(...args) {
        origReplace.apply(this, args);
        onNav();
      };
      window.addEventListener("popstate", () => setTimeout(init, 500));
      const titleEl = document.querySelector("title");
      if (titleEl) {
        new MutationObserver(() => {
          if (window.location.pathname.includes("/groups/") && !document.getElementById("fbgs-btn-container")) {
            addFloatingButton();
          }
        }).observe(titleEl, { childList: true });
      }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        watchNavigation();
        init();
      });
    } else {
      watchNavigation();
      init();
    }
  })();
})();
