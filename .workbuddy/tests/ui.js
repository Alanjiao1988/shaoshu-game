/* 浏览器端冒烟测试（真实 Chrome + CDP）
   用法：node .workbuddy/tests/ui.js
   覆盖：六个视图渲染 · 图标与 manifest 可用 · Service Worker 注册与缓存 · iPad 尺寸布局 */
const fs = require("fs"), path = require("path"), http = require("http"), os = require("os"), net = require("net"), { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const SITE = path.join(ROOT, "site");
const APP_VERSION = fs.readFileSync(path.join(ROOT,"少年主公.html"),"utf8").match(/const APP_VERSION = "([^"]+)";/)[1];
const COUNTER_PREVIEW = path.join(ROOT,"outputs",`少年掌柜_本地试玩_v${APP_VERSION}.html`);
const FULL_PREVIEW = path.join(ROOT,"outputs",`少年主公_iPad横屏完整试玩_v${APP_VERSION}.html`);
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
// 清理旧目录后预先创建本轮profile，减少子进程首次创建目录失败的可能。
fs.mkdirSync(profile,{recursive:true});

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
  if(p==="/__full_preview.html"&&fs.existsSync(FULL_PREVIEW)){
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(fs.readFileSync(FULL_PREVIEW));return;
  }
  if(p==="/__counter_preview.html"&&fs.existsSync(COUNTER_PREVIEW)){
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(fs.readFileSync(COUNTER_PREVIEW));return;
  }
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

const chrome = process.env.SHAOZHU_TEST_BROWSER || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
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
      // 这台机器上 Chrome 155 的 headless 渲染器起不来（无头下 0 个 page target）。
      // 设 SHAOZHU_TEST_HEADFUL=1 改用可见窗口跑，CDP 逻辑完全一致，跑完 Browser.close 自动关。
      ...(process.env.SHAOZHU_TEST_HEADFUL==="1"?["--window-size=1200,1500"]:["--headless=new"]),
      "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", "--mute-audio", "--hide-scrollbars",
      // 仅允许显式指定测试浏览器，仍使用独立profile与原有隔离参数。
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
      const created=await bc.send("Target.createTarget", { url: `http://127.0.0.1:${PORT}/index.html?run=${RUN_ID}` });
      if(created.error) throw new Error("浏览器创建页面失败："+JSON.stringify(created.error));
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
    // A clean test profile initially stops at the family gate. Seed only this isolated
    // profile, then reload so real init (listeners and offline registration) runs.
    await cdp.eval("try{closeSheet();}catch(e){} ST=defaultState(); ST.createdAt=addD(TODAY(),-30); ST.lastOpen=TODAY(); save();");
    await cdp.send("Page.reload",{ignoreCache:true});
    await cdp.eval(`new Promise((resolve,reject)=>{const end=setTimeout(()=>reject(new Error("test init timed out")),15000);const check=()=>{if(document.readyState==="complete"&&window.setTab){clearTimeout(end);resolve(true);}else requestAnimationFrame(check);};check();})`);
    await cdp.eval("try{closeSheet();}catch(e){} VIEW='today'; VIEW_DATE=TODAY(); render();");
    await sleep(400);
    t("今日视图渲染出内容", (await cdp.eval(`document.querySelector("#main").innerHTML.length`)) > 800);
    t("版本号显示为 "+APP_VERSION, (await cdp.eval(`(VIEW="settings",render(),document.querySelector("#main").textContent)`)).includes("少年主公 v"+APP_VERSION));
    for (const v of ["today","week","heroes","stats","report","settings"]) {
      const len = await cdp.eval(`(function(){ VIEW="${v}"; render(); return document.querySelector("#main").innerHTML.length; })()`);
      t("切换到「" + v + "」正常", len > 200, "长度 " + len);
    }

    console.log("\n=== 2.5 星星生产界面回归 ===");
    t("设置不再暴露调试补令与示例覆盖按钮", await cdp.eval(`(function(){VIEW="settings";render();return !document.querySelector('[onclick="grantTickets(3)"]') && !document.querySelector('[onclick="seedDemo()"]');})()`));
    t("奖励表单拒绝负数门槛", await cdp.eval(`(function(){var n=ST.prizes.length;openPrizeEdit();document.querySelector("#pName").value="非法奖励";document.querySelector("#pCost").value="-1000";document.querySelector("#pOk").click();var ok=ST.prizes.length===n && !!document.querySelector("#pOk");closeSheet();return ok;})()`));
    t("奖励表单拒绝无效门槛", await cdp.eval(`(function(){var n=ST.prizes.length;openPrizeEdit();document.querySelector("#pName").value="非法奖励";document.querySelector("#pCost").value="";document.querySelector("#pOk").click();var ok=ST.prizes.length===n;closeSheet();return ok;})()`));
    t("揭榜按钮连续点击只消费一次，动画前已保存", await cdp.eval(`(function(){ST=defaultState();ST.tasks=[{id:"only",name:"测试任务",type:"daily",subject:"cn"}];setRec(TODAY(),"only",1,"full",10);save();openDraw();var b=document.querySelector("#drawBtn");for(var i=0;i<5;i++) b.click();var stored=JSON.parse(localStorage.getItem(KEY));return ST.draws===1 && stored.draws===1 && (Object.keys(stored.heroes).length+stored.vault.length)===1;})()`));
    await sleep(1000);
    t("已用完招贤令不能重复抽", await cdp.eval(`(function(){closeSheet();var before=ST.draws;var r=drawOnce();return r===null && ST.draws===before;})()`));
    t("锦囊连续开启仅扣一次并保留实付", await cdp.eval(`(function(){ST=defaultState();ST.bonusMerit=100;ST.vault=[{uid:"ui-paid",name:"测试奖励",tier:"common",merit:40,redeemed:false}];save();redeem("ui-paid");redeem("ui-paid");var stored=JSON.parse(localStorage.getItem(KEY));closeSheet();return spentMerit()===40 && ST.coupons.length===1 && stored.vault[0].paidMerit===40;})()`));
    t("星星明细解释历史来源，不把卡片星级当货币", await cdp.eval(`(function(){openMeritBook();var text=document.querySelector(".sheet").textContent;closeSheet();return text.includes("历史额外奖励 100") && text.includes("不是可花费的军功");})()`));
    t("真实文件导入拒绝异常金额且不覆盖现存档", await cdp.eval(`new Promise(function(resolve){var before=localStorage.getItem(KEY);var oldAlert=window.alert;window.alert=function(){};var bad=JSON.stringify({tasks:[],bonusMerit:-1000});importData({files:[new File([bad],"bad.json",{type:"application/json"})],value:""});setTimeout(function(){window.alert=oldAlert;resolve(localStorage.getItem(KEY)===before && ST.bonusMerit===100);},150);})`));

    console.log("\n=== 3. Service Worker ===");
    const sw = JSON.parse(await cdp.eval(`Promise.race([navigator.serviceWorker.ready.then(reg=>new Promise(resolve=>{const done=()=>resolve(JSON.stringify({n:1,state:reg.active?.state||"none"}));if(reg.active?.state==="activated")done();else reg.active?.addEventListener("statechange",done,{once:true});})),new Promise(resolve=>setTimeout(()=>resolve(JSON.stringify({n:0,state:"timeout"})),20000))])`));
    t("已注册并激活", sw.n > 0 && sw.state === "activated", JSON.stringify(sw));
    const caches = await cdp.eval(`caches.keys().then(function(k){ return JSON.stringify(k); })`);
    t("缓存名为 shaozhu-v"+APP_VERSION, JSON.parse(caches).includes("shaozhu-v"+APP_VERSION), caches);
    const cached = await cdp.eval(`caches.open("shaozhu-v${APP_VERSION}").then(c=>c.keys()).then(rs=>JSON.stringify(rs.map(r=>new URL(r.url).pathname.split("/").pop()||"root")))`);
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

    console.log("\n=== 4.5 嵌入少年主公的iPad横屏 ===");
    await cdp.eval(`closeSheet();ST=defaultState();ST.lastOpen=TODAY();save();openJiaye();`);
    await cdp.eval(`new Promise((resolve,reject)=>{const end=setTimeout(()=>reject(new Error('embedded game timeout')),15000);const check=()=>{const f=document.querySelector('#jiaye-frame');if(f?.dataset.ready&&f.contentWindow.ShopView){clearTimeout(end);resolve(true);}else requestAnimationFrame(check);};check();})`);
    await cdp.eval(`document.querySelector('#jiaye-frame').contentDocument.querySelector('[data-action="begin"]').click()`);
    for(const size of [{name:'嵌入-iPad小屏横屏',width:1024,height:660},{name:'嵌入-iPad横屏',width:1180,height:720},{name:'嵌入-iPad大屏横屏',width:1366,height:900}]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:size.width,height:size.height,deviceScaleFactor:1,mobile:true});
      const layout=await cdp.eval(`(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const f=document.querySelector('#jiaye-frame'),d=f.contentDocument,w=f.contentWindow,q=s=>d.querySelector(s),b=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};return{outerWidth:document.documentElement.scrollWidth,outerHeight:document.documentElement.scrollHeight,width:innerWidth,height:innerHeight,appWidth:document.querySelector('.app').getBoundingClientRect().width,frame:b(f),scene:b(q('#scene')),task:b(q('#task')),button:b(q('#task [data-action="ask"]')),bottom:b(q('.bottom')),innerHeight:w.innerHeight,customerVisuals:d.querySelectorAll('#customer-zone,#bubble,.customer-art').length};})()`);
      t(size.name+'与少年主公共用<=1020px容器且页面不横溢',layout.appWidth<=1021&&layout.outerWidth<=layout.width+1,JSON.stringify(layout));
      t(size.name+'店铺交易左右同屏且按钮在可用高度内',layout.scene.right<=layout.task.left+2&&layout.button.bottom<=layout.innerHeight&&layout.button.height>=44&&layout.bottom.bottom<=layout.innerHeight+1,JSON.stringify(layout));
      t(size.name+'外壳无额外纵向长页且没有顾客图',layout.outerHeight<=layout.height+2&&layout.customerVisuals===0,JSON.stringify(layout));
      const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(SHOT,size.name+'.png'),Buffer.from(shot.result.data,'base64'));
    }
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1024,height:660,deviceScaleFactor:1,mobile:true});
    for(const selector of ['[data-action="ask"]','[data-action="purchase"]','[data-action="cartplus"]','[data-action="buycart"]','#task [data-action="open"]','#confirm-ok','#task [data-action="select"]']){
      await cdp.eval(`(async()=>{const d=document.querySelector('#jiaye-frame').contentDocument,b=d.querySelector(${JSON.stringify(selector)});if(!b||b.disabled)throw new Error('Missing embedded control '+${JSON.stringify(selector)});b.click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;})()`);
    }
    const saleLayout=await cdp.eval(`(()=>{const w=document.querySelector('#jiaye-frame').contentWindow,d=w.document,b=d.querySelector('[data-action="trade"]').getBoundingClientRect(),request=d.querySelector('.counter-request').getBoundingClientRect();return{height:w.innerHeight,bottom:b.bottom,top:b.top,buttonHeight:b.height,requestTop:request.top,scrolled:d.querySelector('#task').scrollTop};})()`);
    t('1024横屏首笔交货按钮无需滚动且>=44px',saleLayout.bottom<=saleLayout.height-82+2&&saleLayout.requestTop>=0&&saleLayout.buttonHeight>=44&&saleLayout.scrolled===0,JSON.stringify(saleLayout));
    const saleShot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(SHOT,'嵌入-iPad首笔待成交.png'),Buffer.from(saleShot.result.data,'base64'));
    const gameBefore=await cdp.eval(`localStorage.getItem('shaozhu_jiaye_child_v7')`);
    await cdp.eval(`returnFromJiaye();openJiaye();`);
    await cdp.eval(`new Promise((resolve,reject)=>{const end=setTimeout(()=>reject(new Error('game reentry timeout')),10000);const check=()=>{const f=document.querySelector('#jiaye-frame');if(f?.dataset.ready&&f.contentWindow.ShopView){clearTimeout(end);resolve(true);}else requestAnimationFrame(check);};check();})`);
    t('返回军令台再进家业保留进度不自动推进',await cdp.eval(`localStorage.getItem('shaozhu_jiaye_child_v7')===${JSON.stringify(gameBefore)}&&document.querySelector('#jiaye-frame').contentWindow.ShopView.getState().day===1`));
    await cdp.eval(`returnFromJiaye()`);
    if(fs.existsSync(COUNTER_PREVIEW)){
      console.log("\n=== 5. 少年掌柜文字柜台 ===");
      await cdp.send("Page.navigate",{url:`http://127.0.0.1:${PORT}/__counter_preview.html?run=${RUN_ID}`});
      await cdp.eval(`new Promise((resolve,reject)=>{const end=setTimeout(()=>reject(new Error("counter preview timed out")),15000);const check=()=>{if(window.ShopView&&document.querySelector('[data-action="begin"]')){clearTimeout(end);resolve(true);}else requestAnimationFrame(check);};check();})`);
      await cdp.eval(`document.querySelector('[data-action="begin"]').click()`);
      for(const size of [{name:"家业-桌面",width:1440,height:1100,mobile:false},{name:"家业-iPad横屏",width:1180,height:820,mobile:true},{name:"家业-iPad竖屏",width:768,height:1024,mobile:true},{name:"家业-窄屏",width:390,height:844,mobile:true}]){
        await cdp.send("Emulation.setDeviceMetricsOverride",{width:size.width,height:size.height,deviceScaleFactor:1,mobile:size.mobile});
        const layout=await cdp.eval(`(async()=>{await Promise.all([...document.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const q=s=>document.querySelector(s),box=s=>{const r=q(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};return {overflow:document.documentElement.scrollWidth>innerWidth+1,missing:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length,customerVisuals:document.querySelectorAll('#customer-zone,#bubble,.customer-art,.customer-placeholder,.customer-name,.visitor-card').length,requests:document.querySelectorAll('.counter-request').length,shopkeeper:box('#jiaye-shopkeeper'),shelf:box('.shelf'),task:box('#task'),request:box('.counter-request'),button:box('#task [data-action="ask"]'),pointer:getComputedStyle(q('#jiaye-shopkeeper')).pointerEvents};})()`);
        t(size.name+"无横向溢出且所有内嵌图片加载",!layout.overflow&&layout.missing===0,JSON.stringify(layout));
        t(size.name+"只有文字需求和少年人物",layout.customerVisuals===0&&layout.requests===1&&layout.pointer==="none",JSON.stringify(layout));
        t(size.name+"人物避开货架且主按钮触控高度足够",layout.shopkeeper.left>=layout.shelf.right-1&&layout.button.height>=44,JSON.stringify(layout));
        const screenshot=await cdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});
        if(!screenshot.result?.data)throw new Error("Missing counter screenshot");
        fs.writeFileSync(path.join(SHOT,size.name+".png"),Buffer.from(screenshot.result.data,"base64"));
      }
      const previewStudy=await cdp.eval(`({study:localStorage.getItem('shaozhu_v1'),diary:localStorage.getItem('shaozhu_diary'),production:localStorage.getItem('shaozhu_jiaye_child_v7')})`);
      // Native dialog close dispatch is asynchronous; wait a frame after each real click.
      for(const selector of ['[data-action="ask"]','[data-action="purchase"]','[data-action="cartplus"]','[data-action="buycart"]','#task [data-action="open"]','#confirm-ok','#task [data-action="select"]','[data-action="trade"]','#confirm-ok']){
        await cdp.eval(`(async()=>{const selector=${JSON.stringify(selector)},button=document.querySelector(selector);if(!button||button.disabled)throw new Error('Missing/disabled preview control: '+selector);button.click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true;})()`);
      }
      const trade=await cdp.eval(`({cash:ShopView.getState().cash,phase:ShopView.getState().phase,study:localStorage.getItem('shaozhu_v1'),diary:localStorage.getItem('shaozhu_diary'),production:localStorage.getItem('shaozhu_jiaye_child_v7'),preview:!!localStorage.getItem('shaozhu_jiaye_preview_v${APP_VERSION.replaceAll(".","")}')})`);
      t("真实浏览器首笔52钱且只写试玩命名空间",trade.cash===52&&trade.phase==="receipt"&&trade.production===previewStudy.production&&trade.preview&&trade.study===previewStudy.study&&trade.diary===previewStudy.diary,JSON.stringify({cash:trade.cash,phase:trade.phase,production:trade.production,preview:trade.preview,studyUnchanged:trade.study===previewStudy.study,diaryUnchanged:trade.diary===previewStudy.diary}));
      const r=await cdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});fs.writeFileSync(path.join(SHOT,"家业-交易小票.png"),Buffer.from(r.result.data,"base64"));
    }
    if(fs.existsSync(FULL_PREVIEW)){
      const productionBefore=await cdp.eval(`JSON.stringify(['shaozhu_v1','shaozhu_diary','shaozhu_jiaye_child_v7'].map(k=>localStorage.getItem(k)))`);
      await cdp.send('Page.navigate',{url:`http://127.0.0.1:${PORT}/__full_preview.html?run=${RUN_ID}`});
      await cdp.eval(`new Promise((resolve,reject)=>{const end=setTimeout(()=>reject(new Error('isolated shell timeout')),12000);const check=()=>{const f=document.querySelector('#jiaye-frame');if(f?.dataset.ready&&f.contentWindow.ShopView){clearTimeout(end);resolve(true);}else requestAnimationFrame(check);};check();})`);
      const isolation=await cdp.eval(`(()=>{const f=document.querySelector('#jiaye-frame'),key=f.contentWindow.SeasonSave.KEY;f.contentDocument.querySelector('[data-action="begin"]')?.click();return{key,production:JSON.stringify(['shaozhu_v1','shaozhu_diary','shaozhu_jiaye_child_v7'].map(k=>localStorage.getItem(k))),previewSaved:!!localStorage.getItem(key)};})()`);
      t('完整外壳试玩仅写隔离键，不改正式三模块进度',isolation.key.startsWith('shaozhu_preview')&&isolation.previewSaved&&isolation.production===productionBefore,JSON.stringify({key:isolation.key,previewSaved:isolation.previewSaved,productionUnchanged:isolation.production===productionBefore}));
      const fileUrl='file:///'+FULL_PREVIEW.split(path.sep).join('/');
      await cdp.send('Page.navigate',{url:fileUrl});
      const fileLoaded=await cdp.eval(`new Promise((resolve,reject)=>{const end=setTimeout(()=>reject(new Error('file:// preview timeout')),12000);const check=()=>{const f=document.querySelector('#jiaye-frame');if(f?.dataset.ready&&f.contentWindow.ShopView){clearTimeout(end);resolve({proto:location.protocol,ready:f.dataset.ready,day:f.contentWindow.ShopView.getState().day});}else requestAnimationFrame(check);};check();})`);
      t('本地file://直接打开完整试玩不卡死且正常挂载小铺',fileLoaded.proto==='file:'&&fileLoaded.ready==='true'&&fileLoaded.day===1,JSON.stringify(fileLoaded));
    }
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
