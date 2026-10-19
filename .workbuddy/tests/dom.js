/* 真实 DOM 交互测试（jsdom）：不用截图，直接点按钮、填表单、看渲染结果
   用途：本机浏览器渲染器不可用时的替代验收，覆盖「点了会发生什么」
   用法：NODE_PATH=<workspace>/node_modules node .workbuddy/tests/dom.js */
const path = require("path"), fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "少年主公.html"), "utf8");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => {
  const m = String(e.message || e);
  if (/Not implemented|Could not parse CSS|getContext/.test(m)) return;   // jsdom 自身限制，与应用无关
  errors.push(m);
});
vc.on("error", (...a) => errors.push(a.join(" ")));

function make(seed) {
  return new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/index.html",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.confirm = () => true;
      w.alert = () => {};
      w.URL.createObjectURL = () => "blob:stub";
      w.URL.revokeObjectURL = () => {};
      try {
        Object.defineProperty(w.navigator, "share", {
          value: () => Promise.reject(new Error("未授权")), configurable: true
        });
        Object.defineProperty(w.navigator, "canShare", { value: () => false, configurable: true });
      } catch (e) {}
      if (seed) w.localStorage.setItem("shaozhu_v1", seed);
    }
  });
}

let pass = 0, fail = 0;
const t = (n, ok, x) => { if (ok) { pass++; console.log("  ✅ " + n); } else { fail++; console.log("  ❌ " + n + (x ? "  → " + x : "")); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dom = make();
  const w = dom.window, d = w.document;
  const ev = code => w.eval(code);
  const q = sel => d.querySelector(sel);
  const text = sel => (q(sel) ? q(sel).textContent : "");
  // 页面里「+ 新增」有三个（军令/锦囊/…），必须按卡片标题定位，不能取第一个
  const cardByTitle = title => [...d.querySelectorAll(".card")].find(c => c.querySelector("h3") && c.querySelector("h3").textContent.trim() === title);
  const btnIn = (root, re) => root ? [...root.querySelectorAll("button")].find(b => re.test(b.textContent)) : null;
  // 启动 260ms 后会自动弹「今日仪式卡」，先等它弹完再关掉，否则会盖住被测面板
  await sleep(450);
  ev("closeSheet()");

  console.log("=== A. 启动与视图切换（真实点击） ===");
  t("应用启动无未捕获异常", errors.length === 0, errors.slice(0, 2).join(" | "));
  t("今日页渲染出内容", text("#main").length > 100);
  for (const v of ["week", "heroes", "stats", "report", "settings", "today"]) {
    const btn = d.querySelector(`#tabs button[data-view="${v}"]`);
    if (btn) btn.click();
    t("点「" + v + "」能切换", text("#main").length > 200 && !!d.querySelector(".topbar"));
  }

  console.log("\n=== B. 揭榜（点按钮 → 看结果） ===");
  ev(`ST=defaultState(); ST.records={}; ST.ledger={}; ST.tasks=[{id:"t1",name:"测试",subject:"cn",type:"daily",emoji:"📖"}];
      setRec(TODAY(),"t1",1,"full",10); save();`);
  d.querySelector('#tabs button[data-view="heroes"]').click();
  const drawBtn = [...d.querySelectorAll("button")].find(b => /揭榜招贤/.test(b.textContent));
  t("图鉴页有揭榜按钮", !!drawBtn);
  drawBtn.click();
  await sleep(50);
  t("揭榜面板显示本次出率", /出率/.test(text(".sheet")) && /神将/.test(text(".sheet")));
  const ticketBefore = ev("ST.draws");
  q("#drawBtn").click();
  await sleep(1000);
  t("点一次只扣一枚招贤令", ev("ST.draws") === ticketBefore + 1, "draws=" + ev("ST.draws"));
  t("揭榜后出现结果卡", /已录入武将图鉴|折算为|存入锦囊匣/.test(text("#drawResult")), text("#drawResult").slice(0, 40));
  t("结果已落盘（不是只改了内存）", JSON.parse(w.localStorage.getItem("shaozhu_v1")).draws === ev("ST.draws"));

  console.log("\n=== C. 图鉴三态与详情 ===");
  ev(`ST=defaultState(); ST.records={}; ST.heroes={}; ST.story.baseDays=81; ST.story.startDay=TODAY(); save();`);
  d.querySelector('#tabs button[data-view="heroes"]').click();
  t("读到第 27 回，关羽显示「已识得」", /第27回 · 已识得/.test(text("#main")));
  const guan = [...d.querySelectorAll(".hero-card")].find(c => {
    const n = c.querySelector(".hn"); return n && n.textContent.trim() === "关羽";
  });
  t("已识得的卡可点开", !!guan && !!guan.getAttribute("onclick"));
  if (guan) {
    guan.click();
    await sleep(30);
    t("详情页写出「字云长」与回目", /字云长/.test(text(".sheet")) && /第 27 回/.test(text(".sheet")));
    t("未入麾下时明说「尚未入麾下」", /尚未入麾下/.test(text(".sheet")));
    q(".sheet button") && [...d.querySelectorAll(".sheet button")].pop().click();
  }

  console.log("\n=== D. 锦囊匣：改 / 删 / 防退星 ===");
  ev(`ST=defaultState(); ST.bonusMerit=300; ST.vault=[{uid:"a1",name:"旧奖励",emoji:"🎁",tier:"common",merit:50,redeemed:false,gotAt:TODAY()}]; save();`);
  d.querySelector('#tabs button[data-view="heroes"]').click();
  const more = [...d.querySelectorAll("button")].find(b => b.getAttribute("title") === "调整或删除");
  t("未开启的锦囊有「⋯」入口", !!more);
  more.click();
  await sleep(30);
  q("#vName").value = "新奖励名";
  q("#vMerit").value = "120";
  q("#vOk").click();
  await sleep(30);
  t("改名与门槛保存成功", ev("ST.vault[0].name") === "新奖励名" && ev("ST.vault[0].merit") === 120);

  ev(`ST.vault.push({uid:"r1",name:"已开启",emoji:"🎁",tier:"common",merit:40,redeemed:true,paidMerit:40}); save();`);
  d.querySelector('#tabs button[data-view="heroes"]').click();
  const spent0 = ev("spentMerit()");
  t("已开启的锦囊不出现「⋯」入口", ![...d.querySelectorAll("button")].some(b => b.getAttribute("title") === "调整或删除" && /已开启/.test(b.closest(".opt").textContent)));
  ev(`deleteVaultItem("r1")`);
  t("直接调用也删不掉已开启的（防退星）", ev("spentMerit()") === spent0 && ev("ST.vault.length") === 2);

  console.log("\n=== E. 锦囊表单校验（负数不能过） ===");
  d.querySelector('#tabs button[data-view="settings"]').click();
  const addBtn = btnIn(cardByTitle("锦囊设置"), /\+ 新增/);
  t("锦囊设置卡片里有新增按钮", !!addBtn);
  addBtn.click();
  await sleep(30);
  const n0 = ev("ST.prizes.length");
  q("#pName").value = "非法奖励";
  q("#pCost").value = "-1000";
  q("#pOk").click();
  await sleep(30);
  t("负数门槛被拦住", ev("ST.prizes.length") === n0);
  q("#pCost").value = "200";
  q("#pOk").click();
  await sleep(30);
  t("改成合法值就能新增", ev("ST.prizes.length") === n0 + 1 && ev("ST.prizes[ST.prizes.length-1].merit") === 200);

  console.log("\n=== F. 推荐模板 ===");
  d.querySelector('#tabs button[data-view="settings"]').click();
  const presetBtn = btnIn(cardByTitle("锦囊设置"), /推荐模板/);
  presetBtn.click();
  await sleep(30);
  t("模板面板列出三组", /学习向/.test(text(".sheet")) && /生活向/.test(text(".sheet")) && /体验向/.test(text(".sheet")));
  const opt = [...d.querySelectorAll(".sheet .opt")].find(o => /学习向/.test(o.textContent));
  opt.click();
  await sleep(30);
  t("载入后是 6 项且门槛都合法", ev("ST.prizes.length") === 6 && ev("ST.prizes.every(function(p){return p.merit>0;})"));
  t("匣子里的锦囊没被模板动过", ev("ST.vault.length") === 2);

  console.log("\n=== G. 军报趋势与设置页 ===");
  d.querySelector('#tabs button[data-view="stats"]').click();
  t("数据页出现近 8 周趋势", /近 8 周达成率/.test(text("#main")));
  d.querySelector('#tabs button[data-view="settings"]').click();
  t("设置页显示备份提醒", /最近备份/.test(text("#main")));
  t("设置页没有调试补令入口", ![...d.querySelectorAll("button")].some(b => /补发/.test(b.textContent)));

  console.log("\n=== H. 结账页与星星明细 ===");
  d.querySelector('#tabs button[data-view="report"]').click();
  const bookBtn = [...d.querySelectorAll("button")].find(b => /星星明细/.test(b.textContent))
    || (d.querySelector('#tabs button[data-view="stats"]').click(), [...d.querySelectorAll("button")].find(b => /星星明细/.test(b.textContent)));
  t("有「查看星星明细」入口", !!bookBtn);
  if (bookBtn) {
    bookBtn.click();
    await sleep(30);
    t("明细写清点卯+奖励-已用", /点卯/.test(text(".sheet")) && /额外奖励/.test(text(".sheet")) && /已用/.test(text(".sheet")));
  }

  console.log("\n=== I. 异常数据不拖垮启动 ===");
  const bad = JSON.stringify({ tasks: [{ id: "x", name: "n", subject: "cn", type: "daily" }],
    vault: [{ uid: "b", name: "坏", merit: -999, redeemed: false }], schema: 7 });
  const dom2 = make(bad);
  const w2 = dom2.window, d2 = w2.document;
  await sleep(50);
  t("单张坏锦囊仍能正常启动", d2.querySelector("#main").textContent.length > 100);
  t("坏锦囊被标记为门槛异常", /门槛异常|需核查/.test(d2.querySelector("#main").textContent) || w2.eval("ST.vault[0].meritInvalid") === "-999");

  console.log("\n" + "=".repeat(46));
  console.log(`  DOM 交互测试：${pass} 通过 / ${fail} 失败`);
  console.log("=".repeat(46));
  if (fail) { console.log("\n未捕获异常：" + errors.slice(0, 5).join("\n")); process.exitCode = 1; }
  dom.window.close(); dom2.window.close();
  process.exit(process.exitCode || 0);
})();
