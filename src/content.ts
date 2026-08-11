// FB Group Search — Chrome/Edge Extension
// Flow: group page → nhập keywords → navigate search → click "Bài viết" filter → scroll hết → scrape

const PHONE_REGEX = /(0[35789]\d{8,9})|(\+84\d{9,10})/g;
const SCROLL_PAUSE = 3000;  // slower to avoid FB rate-limiting
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
function matchKw(t: string, kw: string): boolean {
  return t.toLowerCase().includes(kw.toLowerCase().trim());
}
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
function esc(s: string): string { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function ct(s: string): string { return s.replace(/\s+/g, " ").trim(); }

function getGroupId(): string {
  const m = window.location.pathname.match(/\/groups\/([^/?]+)/);
  return m ? m[1] : "";
}

/* ── DOM-based Post extraction ── */

// 1. Search những node có "Bình luận" → xác định post (lấy hết tất cả)
// Luôn chạy cả 3 phương pháp song song để bắt được mọi loại post
function getPosts(): Element[] {
  const allDivs = document.querySelectorAll("div");
  const seen = new Set<Element>();

  // Method 1: "·" + "Bình luận" text pattern
  for (let i = 0; i < allDivs.length; i++) {
    const el = allDivs[i];
    const raw = (el as HTMLElement).textContent || "";
    if (raw.length < 80) continue;
    const text = cleanText(raw);
    if (text.includes("·") && text.includes("Bình luận")) {
      seen.add(el);
    }
  }

  // Method 2: data-ad-rendering-role="story_message" (bắt post text-only, ẩn danh)
  const storyMsgDivs = document.querySelectorAll('[data-ad-rendering-role="story_message"]');
  for (let i = 0; i < storyMsgDivs.length; i++) {
    let el: Element | null = storyMsgDivs[i] as Element;
    for (let depth = 0; depth < 4 && el; depth++) { el = el.parentElement; }
    if (el) {
      const txt = (el as HTMLElement).textContent || "";
      if (txt.length >= 80) seen.add(el);
    }
  }

  // Method 3: permalink/post links (bắt mọi post có link)
  const allLinks = document.querySelectorAll("a[href]");
  for (let i = 0; i < allLinks.length; i++) {
    const href = allLinks[i].getAttribute("href") || "";
    if (!/\/groups\/[^/]+\/(?:permalink|posts)\//.test(href)) continue;
    let best: Element | null = null;
    let el: Element | null = allLinks[i];
    for (let d = 0; d < 15 && el; d++) {
      const txt = (el as HTMLElement).textContent || "";
      if (txt.length >= 60) best = el;
      el = el.parentElement;
    }
    if (best) seen.add(best);
  }

  // Remove containers that are nested inside others (keep outermost)
  const candidates = [...seen];
  const posts = candidates.filter(post =>
    !candidates.some(other => other !== post && post.contains(other))
  );
  console.log("[FBGS] getPosts: " + candidates.length + " candidates → " + posts.length + " posts");
  return posts;
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

// Strip FB UI chrome from textContent — conservative, never use .* that eats phone numbers
function stripFBChrome(s: string): string {
  let t = s;

  // 1. Strip leading "Facebook " repetitions
  while (t.startsWith("Facebook ")) t = t.slice("Facebook ".length);

  // 2. Find " · " separator (time marker) → keep everything after (post body area)
  const dotIdx = t.lastIndexOf(" · ");
  if (dotIdx !== -1) t = t.slice(dotIdx + 3);

  // 3. Strip FB share header (now at position 0 after step 2 slice)
  t = t.replace(/^Đã chia sẻ (?:với Nhóm công khai|bài viết của \S+)\s*/u, "");

  // 4. Xoá "… Xem thêm" nhưng GIỮ text phía sau (chứa SĐT bị FB ẩn)
  t = t.replace(/…\s*Xem thêm\s*/gu, " ");
  // 5. Xoá "… Xem Ảnh từ bài viết của Tên Hash" — name can be 1-3 words, followed by hash
  //     Pattern: ...Xem Ảnh từ bài viết của FirstName [LastName [Nickname]] HashString
  t = t.replace(/(?:…\s*)?Xem Ảnh từ bài viết của\s+\S+(?:\s+\S+){0,3}\s*/gu, " ");

  // 6. Cắt tại "N Bình luận" — N luôn là số nhỏ 1-3 chữ số (không phải SĐT)
  const cmtIdx = t.search(/\b\d{1,3}\s*(?:Bình luận|lượt chia sẻ|lượt thích|lượt xem)\b/);
  if (cmtIdx !== -1) t = t.slice(0, cmtIdx);

  // 7. Cắt tại "dưới tên XXX" — đây cũng là cuối
  const underIdx = t.search(/dưới tên\s+\S+/u);
  if (underIdx !== -1) t = t.slice(0, underIdx);

  // 8. Strip long random hash strings (FB tracking, 20+ chars alphanumeric)
  t = t.replace(/\s+[A-Za-z0-9_-]{20,}\s*/g, " ");

  // 9. Strip URL artifacts
  t = t.replace(/\S+\.com\b/g, "");

  // 10. Strip obfuscated "Learn More" remnants: any sequence of dashes + scattered letters
  //     Patterns: "-----M---or-e--", "ar ore-----", "----L n -M--o", "o-r-e", "ar---n- M o-r-e-"
  t = t.replace(/\s*[A-Za-z\s]*[-]{2,}[A-Za-z\s-]*[-]{2,}[A-Za-z\s-]*\s*/g, " ");

  // 11. Strip trailing "Bình luận" without digit prefix (remnant after obfuscation strip)
  t = t.replace(/\s*Bình luận\s*$/u, "");

  // 12. Strip trailing FB reaction words (Chia sẻ, Thích, etc.) at the very end
  t = t.replace(/\s*(?:Xem thêm|Chia sẻ|Thích|Yêu thích|Thương thương|Phẫn nộ|buồn|haha|wow)\s*$/u, "");

  return t.replace(/\s+/g, " ").trim();
}

// Click all "Xem thêm" buttons inside postEl → reveal hidden content
// Returns number of buttons clicked
function expandPost(postEl: Element): number {
  let clicked = 0;
  const btns = postEl.querySelectorAll('[role="button"]');
  for (let i = 0; i < btns.length; i++) {
    const btn = btns[i];
    const txt = (btn as HTMLElement).innerText || "";
    // innerText normalizes away FB's zero-width obfuscation chars
    if (txt.trim() === "Xem thêm" || txt.trim() === "See more") {
      try {
        (btn as HTMLElement).click();
        clicked++;
      } catch (_) { /* ignore */ }
    }
  }
  return clicked;
}

// 2. Lấy permalink từ <a href>
function extractPermalink(postEl: Element, groupId: string): string {
  const links = [...postEl.querySelectorAll("a[href]")];

  // Priority 1: explicit /posts/ or /permalink/ links
  const groupIdEscaped = groupId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const a of links) {
    const href = a.getAttribute("href") || "";
    if (new RegExp("/groups/" + groupIdEscaped + "/(?:posts|permalink)/").test(href)) {
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

  // Priority 3: scan innerHTML for additional FB post ID patterns
  const html = postEl.innerHTML;
  let m = html.match(/set=gm\.(\d+)/);
  if (m) return "https://www.facebook.com/groups/" + groupId + "/permalink/" + m[1] + "/";
  m = html.match(/set=pcb\.(\d+)/);
  if (m) return "https://www.facebook.com/groups/" + groupId + "/permalink/" + m[1] + "/";
  m = html.match(/story_fbid[=:](\d+)/);
  if (m) return "https://www.facebook.com/groups/" + groupId + "/permalink/" + m[1] + "/";
  m = html.match(/top_level_post_id[=:](\d+)/);
  if (m) return "https://www.facebook.com/groups/" + groupId + "/permalink/" + m[1] + "/";
  m = html.match(/ft_ent_identifier[=:](\d+)/);
  if (m) return "https://www.facebook.com/groups/" + groupId + "/posts/" + m[1] + "/";

  // Priority 4: any link to same group that looks like a post
  for (const a of links) {
    const href = a.getAttribute("href") || "";
    // Match /groups/ID/permalink/XXX or /groups/ID/posts/XXX
    m = new RegExp("/groups/" + groupIdEscaped + "/(?:permalink|posts)/(\\d+)").exec(href);
    if (m) return "https://www.facebook.com/groups/" + groupId + "/permalink/" + m[1] + "/";
  }

  return "";
}

// 3. Lấy author từ <a href> pattern
function extractAuthor(postEl: Element, groupId: string): { name: string; profile: string } {
  // Check for anonymous post
  const rawText = (postEl as HTMLElement).textContent || "";
  if (/Người tham gia ẩn danh|Anonymous participant/i.test(rawText)) {
    return { name: "Người tham gia ẩn danh", profile: "" };
  }

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
    '<div style="font-size:13px;color:#65676b;margin-bottom:12px;">Nhập từ khoá tìm kiếm</div>' +
    '<input id="fbgs-kw-input" type="text" style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;" ' +
    'placeholder="VD: quán phở ngon" />' +
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
    startSearch(raw);
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
  // ✕ close button: abort scan + clear sessionStorage so F5 won't re-scan
  document.getElementById("fbgs-close")!.onclick = () => {
    (ov as any).__fbgs_aborted = true;
    sessionStorage.removeItem("fbgs_should_scan");
    rem("fbgs-overlay");
  };
  return ov;
}

function progress(ov: HTMLElement, msg: string) {
  ov.querySelector("#fbgs-body")!.innerHTML =
    '<div style="text-align:center;padding:40px;color:#65676b;"><div style="font-size:32px;margin-bottom:12px;">⏳</div><div>' + msg + '</div></div>';
  // Add "Dừng quét" button
  const ft = ov.querySelector("#fbgs-footer")!;
  ft.innerHTML =
    '<button id="fbgs-stop-btn" style="padding:10px 24px;background:#e74c3c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">⏹ Dừng quét</button>';
  document.getElementById("fbgs-stop-btn")!.onclick = () => {
    (ov as any).__fbgs_aborted = true;
  };
}

function render(ov: HTMLElement, results: Result[], kw: string) {
  const body = ov.querySelector("#fbgs-body")!;
  const ft = ov.querySelector("#fbgs-footer")!;
  if (results.length === 0) {
    body.innerHTML =
      '<div style="text-align:center;padding:40px;color:#65676b;">' +
      '<div style="font-size:32px;margin-bottom:12px;">😕</div>' +
      '<div>Không tìm thấy bài nào khớp.</div>' +
      '<div style="margin-top:8px;font-size:12px;">Từ khoá: ' + esc(kw) + '</div>' +
      '<div style="margin-top:8px;font-size:12px;color:#999;">💡 Mẹo: thử từ khoá ngắn hơn<br>Mở Console (F12) để xem log [FBGS]</div>' +
      '</div>';
    ft.innerHTML =
      '<button id="fbgs-retry" style="padding:10px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">🔄 Thử lại</button>';
    document.getElementById("fbgs-retry")!.onclick = () => { rem("fbgs-overlay"); kwModal(); };
    return;
  }
  let html = '<div style="font-weight:700;margin-bottom:8px;font-size:13px;">🔍 ' + esc(kw) + ' | 📊 <span style="color:#1877f2;">' + results.length + '</span> kết quả</div>';
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
  document.getElementById("fbgs-retry")!.onclick = () => {
    rem("fbgs-overlay");
    sessionStorage.setItem("fbgs_kw", kw);
    sessionStorage.setItem("fbgs_should_scan", "1");
    window.location.reload();
  };
}

function exportCSV(results: Result[]) {
  const BOM = "﻿";
  const hdrs = ["STT", "Từ khoá", "Người đăng", "Link Profile", "SĐT", "Link bài viết", "Nội dung", "Thời gian"];

  function esc(v: string): string {
    if (!v) return '""';
    return '"' + v.replace(/"/g, '""') + '"';
  }

  // Build CSV — phone column uses ="number" format so Excel preserves leading zeros
  const lines: string[] = [];
  lines.push(hdrs.map(esc).join(","));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const phonesVal = r.phones.length > 0
      ? esc('="' + r.phones.join("; ") + '"')  // ="number" → Excel keeps leading 0
      : '""';
    const row = [
      esc(String(i + 1)),
      esc(r.keyword),
      esc(r.authorName),
      esc(r.authorProfile),
      phonesVal,  // ="08177675635" format → Excel treats as text
      esc(r.permalink),
      esc(r.content.replace(/[\n\r]+/g, " ")),
      esc(r.time),
    ];
    lines.push(row.join(","));
  }

  const csv = BOM + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "fb-group-results-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
}

/* ── Navigate to search ── */
function startSearch(kw: string) {
  const groupId = getGroupId();
  if (!groupId) { alert("❌ Không tìm thấy Group ID."); return; }
  const q = encodeURIComponent(kw);
  const url = "https://www.facebook.com/groups/" + groupId + "/search/?q=" + q;
  sessionStorage.setItem("fbgs_kw", kw);
  sessionStorage.setItem("fbgs_should_scan", "1");
  console.log("[FBGS] → " + url);
  window.location.href = url;
}

/* ── Run on search page ──
   Flow: DOM hiện tại → search node có "Bình luận" → xác định post
         → lấy innerText → lấy <a href> → regex phone → lưu kết quả
         → scroll → DOM mới → lặp lại */
async function runOnSearch(kwOverride?: string) {
  let kw: string;
  if (kwOverride) {
    kw = kwOverride;
  } else {
    kw = sessionStorage.getItem("fbgs_kw") || "";
    if (!kw) return;
  }
  console.log("[FBGS] === SEARCH: " + kw + " ===");

  const ov = createOverlay();
  progress(ov, "Đang phân tích trang...");

  const groupId = getGroupId();
  const seenPermalinks = new Set<string>();
  const results: Result[] = [];

  let stableCount = 0;
  let emptyCount = 0;
  let scrollCount = 0;
  let prevPageHeight = document.body.scrollHeight;
  const MAX_STABLE = 12;  // kiên nhẫn hơn, FB load chậm

  while (stableCount < MAX_STABLE && scrollCount < 300) {
    if ((ov as any).__fbgs_aborted) {
      console.log("[FBGS] === ABORTED at round " + scrollCount + " ===");
      break;
    }

    // ── Khi stable ≥ 4: scrollTo bottom để re-trigger FB infinite scroll ──
    if (stableCount >= 4 && stableCount % 2 === 0) {
      console.log("[FBGS] → scrollTo bottom (stable=" + stableCount + ")");
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(SCROLL_PAUSE + 2000);
      // Then scroll up slightly so next scrollBy has room
      window.scrollBy(0, -window.innerHeight * 0.3);
    }

    // ── 1. Search node có "Bình luận" → xác định post ──
    const currentPosts = getPosts();
    let newInThisRound = 0;

    // candidates=0 → scroll to bottom, không tính stableCount
    if (currentPosts.length === 0) {
      emptyCount++;
      console.log("[FBGS] ⚠️ 0 candidates (emptyCount=" + emptyCount + ")");
      if (emptyCount >= 3) {
        console.log("[FBGS] Scrolling back up to reload posts...");
        window.scrollBy(0, -window.innerHeight * 2);
        await sleep(3000);
        emptyCount = 0;
        scrollCount++;
        continue;
      }
      await sleep(3000);
      scrollCount++;
      continue;
    }
    emptyCount = 0;

    for (let i = 0; i < currentPosts.length; i++) {
      if ((ov as any).__fbgs_aborted) break;
      const postEl = currentPosts[i];

      // ── 2. Expand "… Xem thêm" nếu có ──
      const hasSeeMore = ((postEl as HTMLElement).innerText || "").includes("Xem thêm");
      if (hasSeeMore) {
        const clicked = expandPost(postEl);
        if (clicked > 0) await sleep(500); // đợi FB render text mới
      }

      // ── 3. Lấy textContent (sau khi expand) ──
      const rawText = (postEl as HTMLElement).textContent || "";

      // ── 3. Lấy permalink ──
      const permalink = extractPermalink(postEl, groupId);

      // Dedup: dùng permalink nếu có, nếu không thì hash nội dung (tránh trùng "Facebook..." prefix)
      const cleanedText = cleanText(rawText);
      const contentSnippet = stripFBChrome(cleanedText).slice(0, 200);
      const dedupeKey = permalink || "hash:" + contentSnippet;
      if (seenPermalinks.has(dedupeKey)) continue;
      seenPermalinks.add(dedupeKey);
      newInThisRound++;

      const phones = extractPhones(cleanedText);
      const author = extractAuthor(postEl, groupId);
      const time = extractTime(cleanedText);

      const content = stripFBChrome(cleanedText);

      results.push({
        keyword: kw,
        authorName: author.name || "(không rõ)",
        authorProfile: author.profile || "",
        permalink,
        phones,
        content,
        time: time || "",
      });

      if (results.length <= 5) {
        console.log("[FBGS] #" + results.length + " author=" + author.name + " phones=" + phones.join(",") + " permalink=" + permalink.slice(0, 60));
        console.log("  raw[" + rawText.length + "]: " + rawText.slice(0, 200));
        console.log("  content[" + content.length + "]: " + content.slice(0, 250));
      }
    }

    // ── Update stable count ──
    const newHeight = document.body.scrollHeight;
    const pageGrew = newHeight > prevPageHeight + 200;

    if (newInThisRound === 0) {
      stableCount++;
      if (pageGrew) { stableCount = 0; }
    } else {
      stableCount = 0;
    }
    prevPageHeight = newHeight;

    scrollCount++;
    console.log("[FBGS] Round " + scrollCount + ": posts=" + currentPosts.length + " new=" + newInThisRound + " total=" + seenPermalinks.size + " results=" + results.length + " stable=" + stableCount + "/" + MAX_STABLE + " grew=" + pageGrew);
    progress(ov, "Đang quét... (scroll " + scrollCount + ", " + results.length + " bài)");

    // ── 7. Scroll từng bước nhỏ ──
    window.scrollBy(0, window.innerHeight * 0.8);
    await sleep(SCROLL_PAUSE);
    await sleep(500);
  }

  console.log("[FBGS] === DONE: " + results.length + " matched / " + seenPermalinks.size + " posts / " + scrollCount + " scrolls ===");
  sessionStorage.removeItem("fbgs_should_scan");
  render(ov, results, kw);
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
        const raw = prompt("Nhập từ khoá:", sessionStorage.getItem("fbgs_kw") || "");
        if (!raw) return;
        runOnSearch(raw.trim());
      };
      document.body.appendChild(b);
    }, 2000);
  } else if (path.match(/\/groups\/[^/?]+/) && !isSearch) {
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
    } else if (path.match(/\/groups\/[^/?]+/) && !isSearch) {
      fab();
    } else {
      rem("fbgs-fab");
    }
  }
}).observe(document.body || document.documentElement, { childList: true, subtree: true });
