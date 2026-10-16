/* 浏览器端冒烟测试（真实 Chrome + CDP）
   用法：node .workbuddy/tests/ui.js
   覆盖：六个视图渲染 · 图标与 manifest 可用 · Service Worker 注册与缓存 · iPad 尺寸布局 */
const fs = require("fs"), path = require("path"), http = require("http"), os = require("os"), net = require("net"), { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const SITE = path.join(ROOT, "site");
const SHOT = path.join(__dirname, "shots");
if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });

const RUN_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let PORT = 8300, CHROME_PORT = 9300;
/* profile 策略：本轮用唯一目录 + 开跑前清扫上一轮的遗留。
   - 不能每次新建却不清扫 —— Windows 上杀不掉 Chrome 进程树，目录会越积越多
   - 不能固定目录 —— 上一轮残留的 Chrome 还锁着它，下一轮 Chrome 起不来
   - 不能用 os.tmpdir() —— 实测 Chrome 能建出目录、CDP 也能连上，
     但始终 0 个 page target，连 Target.createTarget 都无效（Node 能写临时目录，Chrome 不行）
   所以：唯一目录保证本轮一定能跑；清扫负责把旧的处理掉（还锁着的就留到下轮）。 */
const profile = path.join(__dirname, "_profile_" + RUN_ID);
try {
  fs.readdirSync(__dirname)
    .filter(n => n.startsWith("_profile_") || n.startsWith("_p_"))
    .forEach(n => { try { fs.rmSync(path.join(__dirname, n), { recursive: true, force: true }); } catch (e) {} });
} catch (e) {}

// 端口必须真的是空的。否则上一轮残留的 Chrome 可能还占着调试端口，
// 新 Chrome 绑不上端口，CDP 会连到那个旧浏览器，表现为「找不到页面」。
function isPortFree(port){
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}
async function freePort(start, span){
  for (let i = 0; i < 80; i++){
    const p = start + Math.floor(Math.random() * span);
    if (await isPortFree(p)) return p;
  }
  return await new Promise(res => {           // 兜底：让系统分配
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => res(p)); });
  });
}

const MIME = { ".html":"text/html; charset=utf-8", ".js":"application/javascript; charset=utf-8",
  ".json":"application/manifest+json; charset=utf-8", ".png":"image/png", ".ico":"image/x-icon" };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  const f = path.join(SITE, p.replace(/^\//, ""));
  if (f.startsWith(SITE) && fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream",
      "Cache-Control": "no-store", "Service-Worker-Allowed": "/" });
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end("no"); }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((resolve, reject) => {
  http.get(url, res => { let d = ""; res.on("data", c => d += c);
    res.on("end", () => { if (!d.trim()) return reject(new Error("空响应"));
      try { resolve(JSON.parse(d)); } catch (e) { reject(new Error("JSON: " + d.slice(0,60))); } }); }).on("error", reject);
});
class CDP {
  constructor(ws){ this.ws=ws; this.id=0; this.pending=new Map(); }
  static async connect(url){
    const ws = new WebSocket(url);
    await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=rej; });
    const c = new CDP(ws);
    ws.onmessage = ev => { const m=JSON.parse(ev.data);
      if(m.id && c.pending.has(m.id)){ c.pending.get(m.id)(m); c.pending.delete(m.id); } };
    return c;
  }
  send(method, params){ const id=++this.id;
    this.ws.send(JSON.stringify({id, method, params: params||{}}));
    return new Promise(r => this.pending.set(id, r)); }
  async eval(expr){
    const r = await this.send("Runtime.evaluate",{expression:expr, returnByValue:true, awaitPromise:true, userGesture:true});
    if(r.result && r.result.exceptionDetails){
      const e=r.result.exceptionDetails;
      throw new Error(e.exception ? String(e.exception.description).split("\n")[0] : "eval failed");
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
}
let pass=0, fail=0;
function t(n,c,x){ if(c){pass++;console.log("  ✅ "+n);} else {fail++;console.log("  ❌ "+n+(x?"  → "+x:""));} }

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
let child;
let chromeErr = "";
let ver = null;              // 浏览器级 CDP 信息，收尾时用它优雅关掉 Chrome
(async () => {
  try {
    // 先占两个确定空闲的端口，避免连到残留的 Chrome
    PORT = await freePort(8300, 300);
    CHROME_PORT = await freePort(9300, 300);
    await new Promise(r => server.listen(PORT, "127.0.0.1", r));
    child = spawn(chrome, [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", "--mute-audio", "--hide-scrollbars",
      "--disable-background-mode", "--disable-background-networking", "--disable-sync",
      "--user-data-dir=" + profile, "--remote-debugging-port=" + CHROME_PORT,
      `http://127.0.0.1:${PORT}/index.html?run=${RUN_ID}`
    ], { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.on("data", d => { chromeErr += d.toString(); });

    let verTmp = null;
    for (let i = 0; i < 60; i++) {
      try { verTmp = await getJSON(`http://127.0.0.1:${CHROME_PORT}/json/version`); break; }
      catch (e) { await sleep(400); }
    }
    if (!verTmp) throw new Error("Chrome CDP 未就绪");
    ver = verTmp;
    console.log("浏览器：" + ver.Browser + "\n");

    let list = [];
    for (let i = 0; i < 40; i++) {
      try { list = await getJSON(`http://127.0.0.1:${CHROME_PORT}/json/list`); }
      catch (e) { list = []; }        // CDP 刚起来时偶发空响应，重试即可
      if (list.some(x => x.type === "page" && x.url.includes(RUN_ID))) break;
      await sleep(300);
    }
    let page = list.find(x => x.type === "page" && x.url.includes(RUN_ID));

    // 兜底：命令行里的启动 URL 偶尔不生效（headless 下会得到 0 个 target）。
    // 这时用浏览器级 CDP 自己开一个页面，比猜原因可靠。
    if (!page) {
      console.log("  （启动 URL 未生效，改用 CDP 自己开页面）");
      const bc = await CDP.connect(ver.webSocketDebuggerUrl);
      await bc.send("Target.createTarget", { url: `http://127.0.0.1:${PORT}/index.html?run=${RUN_ID}` });
      await sleep(1500);
      try { bc.ws.close(); } catch (e) {}
      for (let i = 0; i < 30; i++) {
        try { list = await getJSON(`http://127.0.0.1:${CHROME_PORT}/json/list`); } catch (e) { list = []; }
        page = list.find(x => x.type === "page" && x.url.includes(RUN_ID));
        if (page) break;
        await sleep(300);
      }
    }
    if (!page) throw new Error("找不到页面。targets=" + list.length
      + " | chrome stderr: " + chromeErr.slice(0, 300).replace(/\n/g, " ⏎ "));

    const cdp = await CDP.connect(page.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride",{width:1180,height:1500,deviceScaleFactor:1,mobile:false});
    await sleep(1800);

    console.log("=== 1. 静态资源 ===");
    for (const f of ["apple-touch-icon.png","icon-167.png","icon-192.png","icon-512.png",
                     "icon-maskable-192.png","icon-maskable-512.png","manifest.json","sw.js"]) {
      const r = await cdp.eval(`fetch("${f}",{cache:"no-store"}).then(r=>r.status)`);
      t(f + " 可取到", r === 200, "HTTP " + r);
    }
    const mf = await cdp.eval(`fetch("manifest.json",{cache:"no-store"}).then(r=>r.json()).then(j=>JSON.stringify({
      name:j.name, display:j.display, icons:j.icons.length,
      maskable:j.icons.filter(function(i){return i.purpose==="maskable";}).length,
      color:j.theme_color }))`);
    t("manifest 内容正确", /少年主公/.test(mf) && /standalone/.test(mf) && /"icons":4/.test(mf) && /"maskable":2/.test(mf), mf);
    const head = await cdp.eval(`JSON.stringify({
      ati: !!document.querySelector('link[rel="apple-touch-icon"]'),
      man: !!document.querySelector('link[rel="manifest"]'),
      cap: !!document.querySelector('meta[name="apple-mobile-web-app-capable"]')
    })`);
    t("head 里图标与 manifest 标签齐全", /"ati":true/.test(head) && /"man":true/.test(head) && /"cap":true/.test(head), head);
    const persist = await cdp.eval(`requestPersistentStorage()`);
    t("持久化存储已申请（安卓/鸿蒙防回收）", persist === "granted" || persist === "denied" || persist === "unsupported", String(persist));
    console.log("     （持久化结果：" + persist + "）");

    console.log("\n=== 2. 应用可运行 ===");
    await cdp.eval("try{closeSheet();}catch(e){} ST=defaultState(); ST.createdAt=addD(TODAY(),-30); ST.lastOpen=TODAY(); save(); VIEW='today'; VIEW_DATE=TODAY(); render();");
    await sleep(400);
    t("今日视图渲染出内容", (await cdp.eval(`document.querySelector("#main").innerHTML.length`)) > 800);
    t("版本号显示为 2.0.0", /少年主公 v2\.0\.0/.test(await cdp.eval(`(VIEW="settings",render(),document.querySelector("#main").textContent)`)));
    for (const v of ["today","week","heroes","stats","report","settings"]) {
      const len = await cdp.eval(`(function(){ VIEW="${v}"; render(); return document.querySelector("#main").innerHTML.length; })()`);
      t("切换到「" + v + "」正常", len > 200, "长度 " + len);
    }

    console.log("\n=== 3. Service Worker ===");
    const sw = JSON.parse(await cdp.eval(`navigator.serviceWorker.getRegistrations().then(function(rs){
      return JSON.stringify({ n: rs.length, state: rs[0] && rs[0].active ? rs[0].active.state : "none" }); })`));
    t("已注册并激活", sw.n > 0 && sw.state === "activated", JSON.stringify(sw));
    const caches = await cdp.eval(`caches.keys().then(function(k){ return JSON.stringify(k); })`);
    t("缓存名为 shaozhu-v2.0.0", /shaozhu-v2\.0\.0/.test(caches), caches);
    const cached = await cdp.eval(`caches.keys().then(function(k){
      return caches.open(k[0]).then(function(c){ return c.keys(); }).then(function(rs){
        return JSON.stringify(rs.map(function(r){ return r.url.split("/").pop() || "root"; })); }); })`);
    t("图标与 manifest 已进缓存",
      /apple-touch-icon\.png/.test(cached) && /manifest\.json/.test(cached) && /icon-maskable-512\.png/.test(cached), cached);

    console.log("\n=== 4. 截图 ===");
    await cdp.eval(`
      closeSheet(); ST=defaultState(); ST.createdAt=addD(TODAY(),-45);
      ST.ledger={}; ST.records={};
      for(var i=40;i>=1;i--){
        var d=addD(TODAY(),-i); if(isRestDay(d)) continue;
        tasksForDate(d).forEach(function(t){
          var r=Math.random(); if(r<0.13) return;
          var ty=r<0.7?'full':(r<0.86?'half':'poor');
          setRec(d,t.id,ty==='full'?1:0.5,ty,Math.round((t.planMin||15)*(0.7+Math.random()*0.8)));
        });
      }
      ST.breaks=[{id:"b1",from:addD(TODAY(),-9),to:addD(TODAY(),-7),reason:"生病"}];
      settleLedger(); ST.bossDefeats[addD(TODAY(),-2)]=true;
      ST.heroes={"关羽":"2026-09-01","诸葛亮":"2026-09-10","赵云":"2026-10-01"};
      ST.heroCount={"关羽":3,"赵云":6};   // 造两个有星级的，截图好看
      ST.heroCount={"关羽":3,"赵云":6};   // 造两个有星级的，截图好看
      ST.vault=[{uid:"v1",name:"心仪的书一本",emoji:"📚",tier:"rare",merit:200,redeemed:false,gotAt:addD(TODAY(),-1),from:"draw",wish:true}];
      ST.coupons=[{id:"c1",name:"小零食",emoji:"🍬",tier:"common",merit:50,openedAt:addD(TODAY(),-12),status:"done",doneAt:addD(TODAY(),-10),note:"周日买了"},
                  {id:"c2",name:"周末半日自由安排",emoji:"🎡",tier:"rare",merit:400,openedAt:addD(TODAY(),-9),status:"pending",doneAt:"",note:""}];
      ST.signals=[{date:TODAY(),kind:"add_task",detail:"多读一章三国演义",at:1},{date:addD(TODAY(),-1),kind:"too_hard",detail:"奥数练习",at:2}];
      ST.bonusMerit=260; ST.peakMerit=520; ST.draws=6; ST.pity={sinceLegend:13};
      delete ST.records[addD(TODAY(),-1)];
      calcAchievements(); ST.lastOpen=TODAY(); save(); refreshTop(); render();
    `);
    await sleep(500);
    for (const s of [["桌面-今日","today"],["桌面-武将","heroes"],["桌面-军报","report"],["桌面-设置","settings"]]) {
      await cdp.eval(`closeSheet(); VIEW="${s[1]}"; VIEW_DATE=TODAY(); render();`);
      await sleep(550);
      const r = await cdp.send("Page.captureScreenshot", { format:"png", captureBeyondViewport:true });
      fs.writeFileSync(path.join(SHOT, s[0] + ".png"), Buffer.from(r.result.data, "base64"));
      console.log("  📸 " + s[0] + ".png");
    }
    await cdp.send("Emulation.setDeviceMetricsOverride",{width:768,height:1024,deviceScaleFactor:2,mobile:true});
    await cdp.send("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:5});
    await cdp.eval("closeSheet(); ST.breaks=[]; VIEW='today'; VIEW_DATE=TODAY(); render();");
    await sleep(700);
    const r2 = await cdp.send("Page.captureScreenshot", { format:"png", captureBeyondViewport:true });
    fs.writeFileSync(path.join(SHOT, "iPad-今日.png"), Buffer.from(r2.result.data, "base64"));
    console.log("  📱 iPad-今日.png");
    t("iPad 下触摸样式生效", await cdp.eval(`matchMedia("(pointer: coarse)").matches`));

    try { cdp.ws.close(); } catch (e) {}
  } catch (e) {
    console.error("执行失败：" + e.message);
    process.exitCode = 1;
  } finally {
    // 关键：用 CDP 的 Browser.close 优雅关闭。
    // Windows 上 child.kill() 只顾主进程，渲染/GPU/工具进程会活下来并锁住 profile，
    // 导致目录删不掉、下一轮 Chrome 也起不来。Browser.close 会整棵树一起退。
    try {
      if (ver && ver.webSocketDebuggerUrl) {
        const bc = await CDP.connect(ver.webSocketDebuggerUrl);
        await bc.send("Browser.close");
      }
    } catch (e) {}
    try { if (child) child.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
    await sleep(1500);
    for (let i = 0; i < 4 && fs.existsSync(profile); i++) {
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
      if (fs.existsSync(profile)) await sleep(800);
    }
    if (fs.existsSync(profile)) console.log("  （profile 目录未清干净，不影响功能）");
    console.log("\n" + "=".repeat(46));
    console.log(`  浏览器测试：${pass} 通过 / ${fail} 失败`);
    console.log("=".repeat(46));
    if (fail) process.exitCode = 1;
    process.exit(process.exitCode || 0);
  }
})();
