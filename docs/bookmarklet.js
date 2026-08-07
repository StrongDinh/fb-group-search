"use strict";(()=>{var y=["c\u1EA7n t\xECm","c\u1EA7n thu\xEA","c\u1EA7n m\u1EB7t b\u1EB1ng","cho thu\xEA","sang nh\u01B0\u1EE3ng","c\u1EA7n sang","t\xECm m\u1EB7t b\u1EB1ng","thu\xEA m\u1EB7t b\u1EB1ng"],S=/(0[3|5|7|8|9]\d{8})|(\+84\d{9,10})/g;function v(n){let t=[],o;for(;(o=S.exec(n))!==null;)t.push(o[0]);return[...new Set(t)]}function L(n){return n.toLowerCase().trim()}function T(n,t){let o=n.toLowerCase();for(let s of t)if(o.includes(L(s)))return s;return null}function k(){var a;let n=['[role="article"]','[data-pagelet^="GroupFeed"] [role="article"]','div[class*="x1yztbdb"]'],t=null;for(let l of n){let i=document.querySelectorAll(l);if(i.length>5){t=i;break}}if((!t||t.length===0)&&(t=document.querySelectorAll('div[data-ad-comet-preview="message"]'),t.length===0))return[];let o=new Set,s=[];for(let l of t)try{let i="",e=l.querySelectorAll("a[href]");for(let d of e){let r=d.getAttribute("href")||"";if((r.includes("/posts/")||r.includes("/permalink/")||r.includes("/story.php"))&&d.querySelector("span")){i=r.startsWith("http")?r:"https://www.facebook.com"+r.split("?")[0];break}}if(!i)for(let d of e){let r=d.getAttribute("href")||"";if(r.includes("/posts/")||r.includes("/permalink/")){i=r.startsWith("http")?r:"https://www.facebook.com"+r.split("?")[0];break}}if(!i||o.has(i))continue;o.add(i);let c="",p="",u=l.querySelectorAll("h2 a[href], h3 a[href], h4 a[href], strong a[href], span a[href]");for(let d of u){let r=(d.textContent||"").trim(),h=d.getAttribute("href")||"";if(!(h.includes("/groups/")||h.includes("/posts/")||h.includes("/permalink/"))&&r.length>0&&r.length<60){c=r,p=h.startsWith("http")?h:"https://www.facebook.com"+h.split("?")[0];break}}let w=l.querySelectorAll('div[dir="auto"], div[data-ad-comet-preview="message"], div[class*="xdj266r"]'),f="";for(let d of w){let r=(d.textContent||"").trim();r.length>f.length&&(f=r)}f||(f=(l.textContent||"").trim());let x="";for(let d of l.querySelectorAll("span")){let r=((a=d.textContent)==null?void 0:a.trim())||"";if(/\d+\s*(giờ|phút|ngày|tuần|tháng|năm|hours?|mins?|days?|weeks?|months?|years?|ago)/i.test(r)||/\d+\s+tháng\s+\d+/i.test(r)){x=r;break}}if(!f||f.length<10)continue;s.push({authorName:c,authorProfile:p,permalink:i,content:f,time:x})}catch(i){}return s}async function b(){if(!window.location.href.includes("facebook.com/groups/")){alert("\u26A0\uFE0F Vui l\xF2ng m\u1EDF 1 Facebook group tr\u01B0\u1EDBc, sau \u0111\xF3 click l\u1EA1i bookmarklet.");return}let n=prompt(`\u{1F50D} Nh\u1EADp t\u1EEB kho\xE1 (ph\xE2n c\xE1ch b\u1EDFi d\u1EA5u ph\u1EA9y):

B\u1ECF tr\u1ED1ng \u0111\u1EC3 d\xF9ng m\u1EB7c \u0111\u1ECBnh: `+y.join(", "),y.join(", "));if(n===null)return;let t=n.split(",").map(e=>e.trim()).filter(e=>e.length>0);if(t.length===0){alert("\u26A0\uFE0F Vui l\xF2ng nh\u1EADp \xEDt nh\u1EA5t 1 t\u1EEB kho\xE1.");return}let o=E();g(o,"\u0110ang qu\xE9t... (0 b\xE0i)");let s=0,a=k().length;for(;s<30;)window.scrollTo(0,document.body.scrollHeight),await M(1500),s++,g(o,`\u0110ang t\u1EA3i th\xEAm b\xE0i... (scroll ${s}/30)`);g(o,"\u0110ang qu\xE9t b\xE0i vi\u1EBFt...");let l=k();g(o,`\u0110ang l\u1ECDc ${l.length} b\xE0i vi\u1EBFt...`);let i=[];for(let e of l){let c=T(e.content,t);if(!c)continue;let p=v(e.content),u=e.content;i.push({keyword:c,authorName:e.authorName||"(kh\xF4ng r\xF5)",authorProfile:e.authorProfile||"",permalink:e.permalink||"",phones:v(u),content:u.slice(0,300),time:e.time||""})}$(o,i,t)}function E(){let n=document.getElementById("fb-search-overlay");n&&n.remove();let t=document.createElement("div");t.id="fb-search-overlay",t.style.cssText=`
    position: fixed; top: 0; right: 0; width: 460px; height: 100vh;
    background: #fff; z-index: 999999; box-shadow: -4px 0 20px rgba(0,0,0,0.2);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; overflow: hidden;
  `;let o=document.createElement("div");o.id="fb-search-header",o.style.cssText=`
    padding: 12px 16px; background: #1877f2; color: #fff;
    font-weight: 700; font-size: 15px;
    display: flex; justify-content: space-between; align-items: center;
  `,o.innerHTML='<span>\u{1F4CB} K\u1EBFt qu\u1EA3 qu\xE9t</span><span id="fb-search-close" style="cursor:pointer;font-size:20px;">\u2715</span>',t.appendChild(o);let s=document.createElement("div");s.id="fb-search-body",s.style.cssText="flex:1; overflow-y: auto; padding: 8px;",t.appendChild(s);let a=document.createElement("div");return a.id="fb-search-footer",a.style.cssText=`
    padding: 12px 16px; border-top: 1px solid #eee; text-align: center;
    font-size: 13px; color: #65676b;
  `,t.appendChild(a),document.body.appendChild(t),document.getElementById("fb-search-close").onclick=()=>t.remove(),t}function g(n,t){let o=n.querySelector("#fb-search-body");o.innerHTML=`<div style="text-align:center;padding:40px;color:#65676b;">
    <div style="font-size:32px;margin-bottom:12px;">\u23F3</div>
    <div>${t}</div>
  </div>`}function $(n,t,o){let s=n.querySelector("#fb-search-body"),a=n.querySelector("#fb-search-footer");if(t.length===0){s.innerHTML=`<div style="text-align:center;padding:40px;color:#65676b;">
      <div style="font-size:32px;margin-bottom:12px;">\u{1F615}</div>
      <div>Kh\xF4ng t\xECm th\u1EA5y b\xE0i n\xE0o kh\u1EDBp v\u1EDBi t\u1EEB kho\xE1 \u0111\xE3 nh\u1EADp.</div>
      <div style="margin-top:8px;font-size:12px;">T\u1EEB kho\xE1: ${o.join(", ")}</div>
    </div>`,a.innerHTML=`<button id="fb-search-retry" style="
      padding:8px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;
      cursor:pointer;font-size:14px;font-weight:600;">\u{1F504} Th\u1EED l\u1EA1i v\u1EDBi t\u1EEB kho\xE1 kh\xE1c</button>
      <button id="fb-search-close-btn" style="
      padding:8px 24px;background:#e4e6eb;color:#333;border:none;border-radius:6px;
      cursor:pointer;font-size:14px;margin-left:8px;">\u0110\xF3ng</button>`,document.getElementById("fb-search-retry").onclick=()=>{n.remove(),b()},document.getElementById("fb-search-close-btn").onclick=()=>n.remove();return}let l=`<div style="font-weight:700;margin-bottom:8px;font-size:13px;padding:4px 8px;">
    \u{1F50D} T\u1EEB kho\xE1: ${o.join(", ")} | \u{1F4CA} T\xECm th\u1EA5y <span style="color:#1877f2;">${t.length}</span> k\u1EBFt qu\u1EA3
  </div>`;for(let i=0;i<t.length;i++){let e=t[i];l+=`
    <div style="border:1px solid #e4e6eb;border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px;">
      <div style="font-weight:700;color:#1877f2;margin-bottom:4px;">#${i+1} \xB7 ${m(e.keyword)}</div>
      <div style="margin-bottom:2px;">\u{1F464} <strong>${m(e.authorName)}</strong></div>
      ${e.authorProfile?`<div style="margin-bottom:2px;">\u{1F517} <a href="${e.authorProfile}" target="_blank" style="color:#1877f2;">${e.authorProfile}</a></div>`:""}
      ${e.phones.length>0?`<div style="margin-bottom:2px;">\u{1F4DE} ${e.phones.map(c=>`<span style="background:#e7f3ff;padding:1px 6px;border-radius:4px;margin-right:4px;">${c}</span>`).join(" ")}</div>`:'<div style="margin-bottom:2px;color:#ccc;">\u{1F4DE} Kh\xF4ng t\xECm th\u1EA5y S\u0110T</div>'}
      <div style="margin-bottom:2px;">\u{1F4DD} ${m(e.content.slice(0,150))}${e.content.length>150?"...":""}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
        <span style="color:#65676b;font-size:12px;">${e.time||""}</span>
        <a href="${e.permalink}" target="_blank" style="color:#1877f2;font-size:12px;text-decoration:none;">Xem b\xE0i vi\u1EBFt \u2192</a>
      </div>
    </div>`}s.innerHTML=l,a.innerHTML=`
    <button id="fb-search-download" style="
      padding:10px 24px;background:#42b72a;color:#fff;border:none;border-radius:6px;
      cursor:pointer;font-size:14px;font-weight:600;">\u{1F4E5} T\u1EA3i Excel</button>
    <button id="fb-search-retry" style="
      padding:10px 24px;background:#1877f2;color:#fff;border:none;border-radius:6px;
      cursor:pointer;font-size:14px;font-weight:600;margin-left:8px;">\u{1F504} Qu\xE9t l\u1EA1i</button>`,document.getElementById("fb-search-download").onclick=()=>P(t),document.getElementById("fb-search-retry").onclick=()=>{n.remove(),b()}}function P(n){let t="\uFEFF",o=["STT","T\u1EEB kho\xE1","Ng\u01B0\u1EDDi \u0111\u0103ng","Link Profile","S\u0110T","Link b\xE0i vi\u1EBFt","N\u1ED9i dung","Th\u1EDDi gian"],s=n.map((c,p)=>[(p+1).toString(),c.keyword,c.authorName,c.authorProfile,c.phones.join("; "),c.permalink,c.content.replace(/[\n\r]+/g," "),c.time]),a=t+[o,...s].map(c=>c.map(p=>`"${(p||"").replace(/"/g,'""')}"`).join(",")).join(`
`),l=new Blob([a],{type:"text/csv;charset=utf-8;"}),i=URL.createObjectURL(l),e=document.createElement("a");e.href=i,e.download=`fb-group-results-${new Date().toISOString().slice(0,10)}.csv`,e.click(),URL.revokeObjectURL(i)}function M(n){return new Promise(t=>setTimeout(t,n))}function m(n){let t=document.createElement("div");return t.textContent=n,t.innerHTML}b().catch(n=>{console.error("fb-group-search error:",n),alert("C\xF3 l\u1ED7i x\u1EA3y ra. Vui l\xF2ng th\u1EED l\u1EA1i ho\u1EB7c refresh trang.")});})();
