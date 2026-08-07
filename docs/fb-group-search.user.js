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
    function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }
    function esc(s) {
      const d = document.createElement("div");
      d.textContent = s;
      return d.innerHTML;
    }
    function scrapePosts() {
      var _a;
      const articles = document.querySelectorAll('[role="article"]');
      const seen = /* @__PURE__ */ new Set();
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
            const al = article.querySelector("a[aria-label]");
            if (al) {
              authorName = al.getAttribute("aria-label") || "";
              authorProfile = (al.getAttribute("href") || "").split("?")[0];
            }
          }
          let content = "";
          for (const div of article.querySelectorAll('div[dir="auto"], div[data-ad-comet-preview="message"]')) {
            const t = (div.textContent || "").trim();
            if (t.length > content.length) content = t;
          }
          if (!content || content.length < 10) continue;
          let time = "";
          for (const span of article.querySelectorAll("span")) {
            const t = ((_a = span.textContent) == null ? void 0 : _a.trim()) || "";
            if (/\d+\s*(giờ|phút|ngày|tuần|tháng|năm|hours?|mins?|days?|weeks?|months?|years?|ago)/i.test(t)) {
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
    function removeOverlay() {
      var _a;
      (_a = document.getElementById("fbgs-overlay")) == null ? void 0 : _a.remove();
    }
    function createOverlay() {
      removeOverlay();
      const ov = document.createElement("div");
      ov.id = "fbgs-overlay";
      ov.style.cssText = "position:fixed;top:0;right:0;width:460px;height:100vh;background:#fff;z-index:999999;box-shadow:-4px 0 20px rgba(0,0,0,0.2);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:flex;flex-direction:column;overflow:hidden;";
      const hdr = document.createElement("div");
      hdr.style.cssText = "padding:12px 16px;background:#1877f2;color:#fff;font-weight:700;font-size:15px;display:flex;justify-content:space-between;align-items:center;";
      hdr.innerHTML = '<span>\u{1F4CB} K\u1EBFt qu\u1EA3 qu\xE9t</span><span id="fbgs-close" style="cursor:pointer;font-size:20px;">\u2715</span>';
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
      ov.querySelector("#fbgs-body").innerHTML = '<div style="text-align:center;padding:40px;color:#65676b;"><div style="font-size:32px;margin-bottom:12px;">\u23F3</div><div>' + msg + "</div></div>";
    }
    function render(ov, results, keywords) {
      const body = ov.querySelector("#fbgs-body");
      const ft = ov.querySelector("#fbgs-footer");
      if (results.length === 0) {
        body.innerHTML = '<div style="text-align:center;padding:40px;color:#65676b;"><div style="font-size:32px;margin-bottom:12px;">\u{1F615}</div><div>Kh\xF4ng t\xECm th\u1EA5y b\xE0i n\xE0o kh\u1EDBp.</div><div style="margin-top:8px;font-size:12px;">T\u1EEB kho\xE1: ' + keywords.join(", ") + "</div></div>";
        ft.innerHTML = '<button id="fbgs-retry" style="padding:8px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">\u{1F504} Th\u1EED l\u1EA1i</button><button id="fbgs-close-btn" style="padding:8px 24px;background:#e4e6eb;color:#333;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin-left:8px;">\u0110\xF3ng</button>';
        document.getElementById("fbgs-retry").onclick = function() {
          removeOverlay();
          run();
        };
        document.getElementById("fbgs-close-btn").onclick = removeOverlay;
        return;
      }
      let html = '<div style="font-weight:700;margin-bottom:8px;font-size:13px;padding:4px 8px;">\u{1F50D} T\u1EEB kho\xE1: ' + keywords.join(", ") + ' | \u{1F4CA} <span style="color:#1877f2;">' + results.length + "</span> k\u1EBFt qu\u1EA3</div>";
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        html += '<div style="border:1px solid #e4e6eb;border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px;">';
        html += '<div style="font-weight:700;color:#1877f2;margin-bottom:4px;">#' + (i + 1) + " \xB7 " + esc(r.keyword) + "</div>";
        html += '<div style="margin-bottom:2px;">\u{1F464} <strong>' + esc(r.authorName) + "</strong></div>";
        if (r.authorProfile) html += '<div style="margin-bottom:2px;">\u{1F517} <a href="' + r.authorProfile + '" target="_blank" style="color:#1877f2;">' + r.authorProfile + "</a></div>";
        if (r.phones.length > 0) {
          html += '<div style="margin-bottom:2px;">\u{1F4DE} ' + r.phones.map(function(p) {
            return '<span style="background:#e7f3ff;padding:1px 6px;border-radius:4px;margin-right:4px;">' + p + "</span>";
          }).join(" ") + "</div>";
        } else {
          html += '<div style="margin-bottom:2px;color:#ccc;">\u{1F4DE} Kh\xF4ng c\xF3 S\u0110T</div>';
        }
        html += '<div style="margin-bottom:2px;">\u{1F4DD} ' + esc(r.content.slice(0, 150)) + (r.content.length > 150 ? "..." : "") + "</div>";
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">';
        html += '<span style="color:#65676b;font-size:12px;">' + (r.time || "") + "</span>";
        html += '<a href="' + r.permalink + '" target="_blank" style="color:#1877f2;font-size:12px;text-decoration:none;">Xem b\xE0i vi\u1EBFt \u2192</a></div></div>';
      }
      body.innerHTML = html;
      ft.innerHTML = '<button id="fbgs-dl" style="padding:10px 24px;background:#42b72a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">\u{1F4E5} T\u1EA3i Excel</button><button id="fbgs-retry" style="padding:10px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;margin-left:8px;">\u{1F504} Qu\xE9t l\u1EA1i</button>';
      document.getElementById("fbgs-dl").onclick = function() {
        const BOM = "\uFEFF";
        const headers = ["STT", "T\u1EEB kho\xE1", "Ng\u01B0\u1EDDi \u0111\u0103ng", "Link Profile", "S\u0110T", "Link b\xE0i vi\u1EBFt", "N\u1ED9i dung", "Th\u1EDDi gian"];
        const rows = results.map(function(r, i) {
          return [(i + 1).toString(), r.keyword, r.authorName, r.authorProfile, r.phones.join("; "), r.permalink, r.content.replace(/[\n\r]+/g, " "), r.time];
        });
        const csv = BOM + [headers].concat(rows).map(function(row) {
          return row.map(function(c) {
            return '"' + (c || "").replace(/"/g, '""') + '"';
          }).join(",");
        }).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "fb-group-results-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".csv";
        a.click();
        URL.revokeObjectURL(url);
      };
      document.getElementById("fbgs-retry").onclick = function() {
        removeOverlay();
        run();
      };
    }
    async function run() {
      const kwInput = prompt(
        "\u{1F50D} Nh\u1EADp t\u1EEB kho\xE1 (ph\xE2n c\xE1ch b\u1EDFi d\u1EA5u ph\u1EA9y):\n\nB\u1ECF tr\u1ED1ng \u0111\u1EC3 d\xF9ng m\u1EB7c \u0111\u1ECBnh: " + DEFAULT_KEYWORDS.join(", "),
        DEFAULT_KEYWORDS.join(", ")
      );
      if (kwInput === null) return;
      const keywords = kwInput.split(",").map(function(k) {
        return k.trim();
      }).filter(function(k) {
        return k.length > 0;
      });
      if (keywords.length === 0) {
        alert("\u26A0\uFE0F Vui l\xF2ng nh\u1EADp \xEDt nh\u1EA5t 1 t\u1EEB kho\xE1.");
        return;
      }
      const ov = createOverlay();
      progress(ov, "\u0110ang qu\xE9t... (0 b\xE0i)");
      for (let i = 0; i < MAX_SCROLLS; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(SCROLL_PAUSE);
        progress(ov, "\u0110ang t\u1EA3i th\xEAm b\xE0i... (" + (i + 1) + "/" + MAX_SCROLLS + ")");
      }
      progress(ov, "\u0110ang qu\xE9t b\xE0i vi\u1EBFt...");
      const posts = scrapePosts();
      progress(ov, "\u0110ang l\u1ECDc " + posts.length + " b\xE0i...");
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
      render(ov, results, keywords);
    }
    if (!window.location.pathname.includes("/groups/")) {
      alert("\u26A0\uFE0F Vui l\xF2ng m\u1EDF 1 Facebook group tr\u01B0\u1EDBc, sau \u0111\xF3 ch\u1EA1y l\u1EA1i.");
    } else {
      run();
    }
  })();
})();
