// FB Group Search — Chrome/Edge Extension
// Flow: group page → nhập keywords → navigate search → click "Bài viết" filter → scroll hết → scrape

const PHONE_REGEX = /(0[35789]\d{8,9})|(\+84\d{9,10})/g;
const SCROLL_PAUSE = 2000;
const DK = ["cần tìm", "cần thuê", "cần mặt bằng", "cho thuê", "sang nhượng", "cần sang", "tìm mặt bằng", "thuê mặt bằng"];

// Normalize Unicode digits (bold, fullwidth, etc.) → ASCII digits + strip phone separators
function normalizeForPhone(s: string): string {
  // Normalize NFKD decomposes many Unicode chars, but doesn't catch all
  // Map common Unicode digit forms manually
  return s
    // Mathematical Bold digits 𝟎-𝟗 (U+1D7CE-U+1D7D7)
    .replace(/[\u{1D7CE}\u{1D7CF}\u{1D7D0}\u{1D7D1}\u{1D7D2}\u{1D7D3}\u{1D7D4}\u{1D7D5}\u{1D7D6}\u{1D7D7}]/gu, c => String("𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗".indexOf(c)))
    // Fullwidth digits ０-９
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    // Strip dots, spaces, hyphens commonly used as phone separators
    .replace(/[.\- ]/g, "");
}

function extractPhones(t: string): string[] {
  // Normalize Unicode digits first, then run regex
  const normalized = normalizeForPhone(t);
  const phones: string[] = []; let m: RegExpExecArray | null;
  while ((m = PHONE_REGEX.exec(normalized)) !== null) phones.push(m[0]);
  PHONE_REGEX.lastIndex = 0;
  return [...new Set(phones)];
}
function matchKw(t: string, kws: string[]): string | null {
  const lo = t.toLowerCase();
  for (const kw of kws) { if (lo.includes(kw.toLowerCase().trim())) return kw; }
  return null;
}
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
function esc(s: string): string { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function ct(s: string): string { return s.replace(/\s+/g, " ").trim(); }

function getGroupId(): string {
  const m = window.location.pathname.match(/\/groups\/(\d+)/);
  return m ? m[1] : "";
}

/* ── DOM-based Post extraction ── */

// Facebook search result post container selector
const POST_SEL = "div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl";

// 1. Search những node có "Bình luận" → xác định post
function getPosts(): Element[] {
  const candidates = [...document.querySelectorAll(POST_SEL)];
  const postCandidates = candidates.filter(el => {
    const text = (el as HTMLElement).innerText || "";
    return text.length > 200 && text.includes("·") && text.includes("Bình luận");
  });
  // Keep only innermost post containers
  return postCandidates.filter(post =>
    !postCandidates.some(other => other !== post && post.contains(other))
  );
}

// Strip Facebook's zero-width obfuscation chars (dùng cho keyword + phone matching)
function cleanText(s: string): string {
  return s
    .replace(/​/g, "").replace(/‌/g, "").replace(/‍/g, "").replace(/‎/g, "").replace(/‏/g, "")
    .replace(/﻿/g, "").replace(/­/g, "").replace(/͏/g, "").replace(/؜/g, "")
    .replace(/⁠/g, "").replace(/⁡/g, "").replace(/⁢/g, "").replace(/⁣/g, "").replace(/⁤/g, "")
    .replace(/⁦/g, "").replace(/⁧/g, "").replace(/⁨/g, "").replace(/⁩/g, "").replace(/⁪/g, "")
    .replace(/⁫/g, "").replace(/⁬/g, "").replace(/⁭/g, "").replace(/⁮/g, "").replace(/⁯/g, "")
    .replace(/᠎/g, "").replace(/ /g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/\s+/g, " ").trim();
}

// Strip FB UI chrome from cleaned innerText → just post body
// cleanText đã xoá zero-width chars, làm lộ text ẩn "Facebook" của FB UI
// Strip "Facebook" prefix + trailing FB patterns
const _FB_SUFFIX_RE = /\s*(?:Xem thêm|Bình luận|Chia sẻ|Thích|Yêu thích|Thương thương|Phẫn nộ|buồn|haha|wow)\s*$/;
const _FB_SUFFIX2_RE = /\s*\d+\s+Bình luận\b.*/;
const _FB_SUFFIX3_RE = /\s*\d+\s+lượt (?:chia sẻ|bình luận)\b.*/;
const _FB_SUFFIX4_RE = /\s*dưới tên\s+\S+.*/;

function stripFBChrome(s: string): string {
  let t = s;
  // 1. Strip leading "Facebook " repetitions (FB zero-width chars now collapsed)
  while (t.startsWith("Facebook ")) {
    t = t.slice("Facebook ".length);
  }
  // 2. Strip FB share header: "Đã chia sẻ với ... Nhóm công khai", "Đã chia sẻ bài viết của ...", etc.
  t = t.replace(/^Đã chia sẻ (?:với|bài viết của)[^.]*?\.?\s*/u, "");
  // 3. Find " · " separator (between time & post body). Take everything after LAST " · "
  const dotIdx = t.lastIndexOf(" · ");
  if (dotIdx !== -1) {
    t = t.slice(dotIdx + 3);
  }
  // 4. Strip trailing FB chrome
  t = t.replace(_FB_SUFFIX_RE, "");
  t = t.replace(_FB_SUFFIX2_RE, "");
  t = t.replace(_FB_SUFFIX3_RE, "");
  t = t.replace(_FB_SUFFIX4_RE, "");
  // 5. Strip remaining FB URL artifacts (like "FdBkzQ.com" etc.)
  t = t.replace(/\S+\.com\b/g, "").replace(/\s+/g, " ");
  return t.trim();
}

// 2. Lấy permalink từ <a href>
function extractPermalink(postEl: Element, groupId: string): string {
  const links = [...postEl.querySelectorAll("a[href]")];

  // Priority 1: explicit /posts/ or /permalink/ links
  for (const a of links) {
    const href = a.getAttribute("href") || "";
    if (/\/groups\/\d+\/(?:posts|permalink)\//.test(href)) {
      return href.startsWith("http") ? href.split("?")[0] : "https://www.facebook.com" + href.split("?")[0];
    }
  }

  // Priority 2: set=gm.X, set=pcb.X, story_fbid=, fbid=
  for (const a of links) {
    const href = a.getAttribute("href") || "";
    let m = href.match(/set=gm\.(\d+)/);
    if (m) return "https://www.facebook.com/groups/" + groupId + "/permalink/" + m[1] + "/";
    m = href.match(/set=pcb\.(\d+)/);
    if (m) return "https://www.facebook.com/groups/" + groupId + "/permalink/" + m[1] + "/";
    m = href.match(/story_fbid=(\d+)/);
    if (m) return "https://www.facebook.com/groups/" + groupId + "/permalink/" + m[1] + "/";
    m = href.match(/[?&]fbid=(\d+)/);
    if (m) return "https://www.facebook.com/groups/" + groupId + "/permalink/" + m[1] + "/";
  }

  // Priority 3: scan innerHTML
  const html = postEl.innerHTML;
  let m = html.match(/set=gm\.(\d+)/);
  if (m) return "https://www.facebook.com/groups/" + groupId + "/permalink/" + m[1] + "/";
  m = html.match(/set=pcb\.(\d+)/);
  if (m) return "https://www.facebook.com/groups/" + groupId + "/permalink/" + m[1] + "/";

  return "";
}

// 3. Lấy author từ <a href> pattern
function extractAuthor(postEl: Element, groupId: string): { name: string; profile: string } {
  const links = [...postEl.querySelectorAll("a[href]")];
  for (const a of links) {
    const href = a.getAttribute("href") || "";
    const label = cleanText(a.textContent || "");

    const isGroupUser = new RegExp("/groups/" + groupId + "/user/\\d+/?").test(href);
    const isProfile = /^\/(?:profile\.php\?id=\d+|[a-zA-Z0-9_.]{3,50})\/?/.test(href);
    const isNotSpecial = !/facebook|group|page|nhóm|trang|photo|watch|hashtag|posts|permalink|story|reel|marketplace|notifications|friends|groups\/\d+\/user/i.test(href)
      || isGroupUser;

    if ((isProfile || isGroupUser) && isNotSpecial && label.length >= 2 && label.length <= 60) {
      const profile = href.startsWith("http") ? href.split("?")[0] : "https://www.facebook.com" + href.split("?")[0];
      return { name: label, profile };
    }
  }
  return { name: "", profile: "" };
}

// 4. Lấy thời gian từ cleaned text
function extractTime(text: string): string {
  const m = text.match(/(?:·|•)\s*(\d{1,2}\s*(?:giờ|phút|ngày|tuần|tháng|năm))\b/i);
  if (m) return m[1].trim();
  const m2 = text.match(/(hôm qua|hôm kia|vừa xong|mới đây|yesterday)/i);
  return m2 ? m2[1] : "";
}

/* ── UI ── */
function rem(id: string) { document.getElementById(id)?.remove(); }
interface Result { keyword: string; authorName: string; authorProfile: string; permalink: string; phones: string[]; content: string; time: string; }

function fab() {
  if (document.getElementById("fbgs-fab")) return;
  const b = document.createElement("div");
  b.id = "fbgs-fab";
  b.title = "Quét bài viết trong group";
  b.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:999998;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1877f2,#42b72a);color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(24,119,242,0.5);transition:transform 0.2s;user-select:none;";
  b.textContent = "🔍";
  b.onmouseenter = () => { b.style.transform = "scale(1.1)"; };
  b.onmouseleave = () => { b.style.transform = "scale(1)"; };
  b.onclick = kwModal;
  document.body.appendChild(b);
}

function kwModal() {
  rem("fbgs-modal-overlay"); rem("fbgs-overlay");
  const ov = document.createElement("div");
  ov.id = "fbgs-modal-overlay";
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center;";
  const mo = document.createElement("div");
  mo.style.cssText = "background:#fff;border-radius:12px;padding:24px;width:420px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);font-family:system-ui,sans-serif;";
  mo.innerHTML =
    '<div style="font-size:18px;font-weight:700;margin-bottom:8px;">🔍 Quét bài viết trong Group</div>' +
    '<div style="font-size:13px;color:#65676b;margin-bottom:12px;">Nhập từ khoá, phân cách bởi dấu phẩy (,)</div>' +
    '<input id="fbgs-kw-input" type="text" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;" ' +
    'placeholder="VD: ' + esc(DK.join(", ")) + '" />' +
    '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">' +
    '<button id="fbgs-cancel-btn" style="padding:10px 20px;background:#e4e6eb;color:#1c1e21;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">Huỷ</button>' +
    '<button id="fbgs-start-btn" style="padding:10px 20px;background:#1877f2;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">🚀 Bắt đầu quét</button></div>';
  ov.appendChild(mo);
  document.body.appendChild(ov);
  const inp = document.getElementById("fbgs-kw-input") as HTMLInputElement;
  ov.onclick = (e) => { if (e.target === ov) rem("fbgs-modal-overlay"); };
  document.getElementById("fbgs-cancel-btn")!.onclick = () => rem("fbgs-modal-overlay");
  document.getElementById("fbgs-start-btn")!.onclick = () => {
    const raw = inp.value.trim();
    if (!raw) { inp.style.borderColor = "#e74c3c"; inp.focus(); return; }
    rem("fbgs-modal-overlay");
    startSearch(raw.split(",").map(k => k.trim()).filter(k => k.length > 0));
  };
  inp.onkeydown = (e) => { if (e.key === "Enter") document.getElementById("fbgs-start-btn")!.click(); };
  setTimeout(() => inp.focus(), 100);
}

function createOverlay() {
  rem("fbgs-overlay");
  const ov = document.createElement("div");
  ov.id = "fbgs-overlay";
  ov.style.cssText = "position:fixed;top:0;right:0;width:460px;max-width:100vw;height:100vh;background:#fff;z-index:999999;box-shadow:-4px 0 20px rgba(0,0,0,0.2);font-family:system-ui,sans-serif;display:flex;flex-direction:column;overflow:hidden;";
  ov.innerHTML =
    '<div style="padding:12px 16px;background:#1877f2;color:#fff;font-weight:700;font-size:15px;display:flex;justify-content:space-between;flex-shrink:0;">' +
    '<span>📋 Kết quả tìm kiếm</span><span id="fbgs-close" style="cursor:pointer;font-size:20px;">✕</span></div>' +
    '<div id="fbgs-body" style="flex:1;overflow-y:auto;padding:8px;"></div>' +
    '<div id="fbgs-footer" style="padding:12px 16px;border-top:1px solid #eee;text-align:center;font-size:13px;color:#65676b;flex-shrink:0;"></div>';
  document.body.appendChild(ov);
  document.getElementById("fbgs-close")!.onclick = () => rem("fbgs-overlay");
  return ov;
}

function progress(ov: HTMLElement, msg: string) {
  ov.querySelector("#fbgs-body")!.innerHTML =
    '<div style="text-align:center;padding:40px;color:#65676b;"><div style="font-size:32px;margin-bottom:12px;">⏳</div><div>' + msg + '</div></div>';
}

function render(ov: HTMLElement, results: Result[], kws: string[]) {
  const body = ov.querySelector("#fbgs-body")!;
  const ft = ov.querySelector("#fbgs-footer")!;
  if (results.length === 0) {
    body.innerHTML =
      '<div style="text-align:center;padding:40px;color:#65676b;">' +
      '<div style="font-size:32px;margin-bottom:12px;">😕</div>' +
      '<div>Không tìm thấy bài nào khớp.</div>' +
      '<div style="margin-top:8px;font-size:12px;">Từ khoá: ' + esc(kws.join(", ")) + '</div>' +
      '<div style="margin-top:8px;font-size:12px;color:#999;">💡 Mẹo: thử từ khoá ngắn hơn<br>Mở Console (F12) để xem log [FBGS]</div>' +
      '</div>';
    ft.innerHTML =
      '<button id="fbgs-retry" style="padding:10px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">🔄 Thử lại</button>';
    document.getElementById("fbgs-retry")!.onclick = () => { rem("fbgs-overlay"); kwModal(); };
    return;
  }
  let html = '<div style="font-weight:700;margin-bottom:8px;font-size:13px;">🔍 ' + esc(kws.join(", ")) + ' | 📊 <span style="color:#1877f2;">' + results.length + '</span> kết quả</div>';
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    html += '<div style="border:1px solid #e4e6eb;border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px;">';
    html += '<div style="font-weight:700;color:#1877f2;">#' + (i + 1) + ' · ' + esc(r.keyword) + '</div>';
    html += '<div>👤 ' + esc(r.authorName || "(không rõ)") + '</div>';
    if (r.authorProfile) html += '<div>🔗 <a href="' + r.authorProfile + '" target="_blank" style="color:#1877f2;word-break:break-all;">' + r.authorProfile + '</a></div>';
    if (r.phones.length > 0) html += '<div>📞 ' + r.phones.map(p => '<span style="background:#e7f3ff;padding:1px 6px;border-radius:4px;margin-right:4px;">' + esc(p) + '</span>').join(" ") + '</div>';
    else html += '<div style="color:#ccc;">📞 Không có SĐT</div>';
    html += '<div>📝 ' + esc(r.content.slice(0, 200)) + (r.content.length > 200 ? "..." : "") + '</div>';
    html += '<div style="display:flex;justify-content:space-between;margin-top:6px;">';
    html += '<span style="color:#65676b;font-size:12px;">' + esc(r.time || "") + '</span>';
    html += '<a href="' + r.permalink + '" target="_blank" style="color:#1877f2;font-size:12px;">Xem bài viết →</a></div></div>';
  }
  body.innerHTML = html;
  ft.innerHTML =
    '<button id="fbgs-dl" style="padding:10px 24px;background:#42b72a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">📥 Tải Excel</button>' +
    '<button id="fbgs-retry" style="padding:10px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;margin-left:8px;">🔄 Quét lại</button>';
  document.getElementById("fbgs-dl")!.onclick = () => exportCSV(results);
  document.getElementById("fbgs-retry")!.onclick = () => { rem("fbgs-overlay"); kwModal(); };
}

function exportCSV(results: Result[]) {
  const BOM = "﻿";
  const hdrs = ["STT", "Từ khoá", "Người đăng", "Link Profile", "SĐT", "Link bài viết", "Nội dung", "Thời gian"];
  const rows = results.map((r, i) => [
    String(i + 1), r.keyword, r.authorName, r.authorProfile,
    r.phones.map(p => "\t" + p).join("; "),  // tab prefix — Excel keeps leading 0
    r.permalink, r.content.replace(/[\n\r]+/g, " "), r.time
  ]);
  const csv = BOM + [hdrs].concat(rows).map(row => row.map(c => '"' + ((c || "").replace(/"/g, '""')) + '"').join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "fb-group-results-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
}

/* ── Navigate to search ── */
function startSearch(kws: string[]) {
  const groupId = getGroupId();
  if (!groupId) { alert("❌ Không tìm thấy Group ID."); return; }
  const q = encodeURIComponent(kws.join(" "));
  const url = "https://www.facebook.com/groups/" + groupId + "/search/?q=" + q;
  sessionStorage.setItem("fbgs_kws", JSON.stringify(kws));
  sessionStorage.setItem("fbgs_should_scan", "1");
  console.log("[FBGS] → " + url);
  window.location.href = url;
}

/* ── Run on search page ──
   Flow: DOM hiện tại → search node có "Bình luận" → xác định post
         → lấy innerText → lấy <a href> → regex phone → lưu kết quả
         → scroll → DOM mới → lặp lại */
async function runOnSearch(kwsOverride?: string[]) {
  let kws: string[];
  if (kwsOverride && kwsOverride.length > 0) {
    kws = kwsOverride;
  } else {
    const raw = sessionStorage.getItem("fbgs_kws");
    if (!raw) return;
    kws = JSON.parse(raw);
  }
  console.log("[FBGS] === SEARCH: " + kws.join(", ") + " ===");

  const ov = createOverlay();
  progress(ov, "Đang phân tích trang...");

  const groupId = getGroupId();
  const seenPermalinks = new Set<string>();
  const results: Result[] = [];

  let stableCount = 0;
  let scrollCount = 0;

  while (stableCount < 5 && scrollCount < 200) {
    // ── 1. Search node có "Bình luận" → xác định post ──
    const currentPosts = getPosts();
    let newInThisRound = 0;

    for (let i = 0; i < currentPosts.length; i++) {
      const postEl = currentPosts[i];

      // ── 2. Lấy textContent (bao gồm cả text ẩn sau "Xem thêm") ──
      const rawText = (postEl as HTMLElement).textContent || "";

      // ── 3. Lấy <a href> → permalink ──
      const permalink = extractPermalink(postEl, groupId);

      // Bỏ qua post đã xử lý
      if (!permalink || seenPermalinks.has(permalink)) continue;
      seenPermalinks.add(permalink);
      newInThisRound++;

      // Clean text cho phone regex + keyword matching + content
      const cleanedText = cleanText(rawText);

      // ── 4. Regex phone ──
      const phones = extractPhones(cleanedText);

      // ── 5. Match keyword ──
      const kw = matchKw(cleanedText, kws);
      if (!kw) continue;

      // ── Lấy author + time ──
      const author = extractAuthor(postEl, groupId);
      const time = extractTime(cleanedText);

      // ── 6. Lưu kết quả ──
      results.push({
        keyword: kw,
        authorName: author.name || "(không rõ)",
        authorProfile: author.profile || "",
        permalink,
        phones,
        content: stripFBChrome(cleanedText),
        time: time || "",
      });

      // Debug first 5 matched
      if (results.length <= 5) {
        console.log("[FBGS] #" + results.length + " matched: kw=" + kw + " author=" + author.name + " phones=" + phones.join(",") + " permalink=" + permalink.slice(0, 60));
        console.log("  raw[" + rawText.length + "]: " + rawText.slice(0, 200));
        const stripped = stripFBChrome(cleanedText);
        console.log("  content[" + stripped.length + "]: " + stripped.slice(0, 250));
      }
    }

    // ── Update stable count ──
    if (newInThisRound === 0) stableCount++;
    else stableCount = 0;

    scrollCount++;
    progress(ov, "Đang quét... (scroll " + scrollCount + ", " + results.length + " khớp, " + seenPermalinks.size + " bài)");

    // ── 7. Scroll để load DOM mới ──
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(SCROLL_PAUSE);
  }

  console.log("[FBGS] === DONE: " + results.length + " matched / " + seenPermalinks.size + " posts / " + scrollCount + " scrolls ===");
  sessionStorage.removeItem("fbgs_should_scan");
  render(ov, results, kws);
}

/* ── Init ── */
(function init() {
  const path = window.location.pathname;
  const isSearch = path.includes("/search/");
  const shouldScan = sessionStorage.getItem("fbgs_should_scan") === "1";

  if (isSearch && shouldScan) {
    console.log("[FBGS] Auto-scan search page...");
    setTimeout(() => runOnSearch(), 2500);
  } else if (isSearch) {
    // User opened search manually — show scan button
    setTimeout(() => {
      if (document.getElementById("fbgs-fab")) return;
      const b = document.createElement("div");
      b.id = "fbgs-fab";
      b.title = "Quét kết quả tìm kiếm";
      b.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:999998;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#ff6b35,#f7c948);color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(255,107,53,0.5);transition:transform 0.2s;user-select:none;";
      b.textContent = "🔄";
      b.onclick = () => {
        const raw = prompt("Nhập từ khoá (phân cách bởi dấu phẩy):", sessionStorage.getItem("fbgs_kws")?.replace(/[\[\]"]/g, "") || "");
        if (!raw) return;
        runOnSearch(raw.split(",").map(k => k.trim()).filter(k => k.length > 0));
      };
      document.body.appendChild(b);
    }, 2000);
  } else if (path.match(/\/groups\/\d+/) && !isSearch) {
    fab();
  }
})();

let lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    const path = window.location.pathname;
    const isSearch = path.includes("/search/");
    const shouldScan = sessionStorage.getItem("fbgs_should_scan") === "1";
    if (isSearch && shouldScan) {
      setTimeout(() => runOnSearch(), 2500);
    } else if (path.match(/\/groups\/\d+/) && !isSearch) {
      fab();
    } else {
      rem("fbgs-fab");
    }
  }
}).observe(document.body || document.documentElement, { childList: true, subtree: true });
