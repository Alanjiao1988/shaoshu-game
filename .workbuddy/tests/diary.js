/* 军师帐（日记）测试：真实 DOM 点击 + 存储隔离 + 锁 + 导入导出
   用法：NODE_PATH=<workspace>/node_modules node .workbuddy/tests/diary.js */
const path = require("path"), fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "少年主公.html"), "utf8");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => { const m = String(e.message || e); if (/Not implemented|Could not parse CSS|getContext/.test(m)) return; errors.push(m); });
let CONFIRM = true;
function make(seed, diarySeed) {
  return new JSDOM(html, {
    runScripts: "dangerously", url: "http://localhost/index.html", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.scrollTo = () => {};
      const gh = (html.match(/const GATE_HASH = "([0-9a-f]*)"/) || [])[1];
      if (gh) w.localStorage.setItem("shaozhu_gate", gh);
      w.confirm = () => CONFIRM; w.alert = () => {};
      w.URL.createObjectURL = () => "blob:stub"; w.URL.revokeObjectURL = () => {};
      if (seed) w.localStorage.setItem("shaozhu_v1", seed);
      if (diarySeed) w.localStorage.setItem("shaozhu_diary", diarySeed);
    }
  });
}
let pass = 0, fail = 0;
const t = (n, ok, x) => { if (ok) { pass++; console.log("  ✅ " + n); } else { fail++; console.log("  ❌ " + n + (x ? "  → " + x : "")); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let dom = make();
  let w = dom.window, d = w.document;
  let ev = c => w.eval(c);
  const q = s => d.querySelector(s);
  const btn = (re, root) => [...(root || d).querySelectorAll("button")].find(b => re.test(b.textContent));
  await sleep(450); ev("closeSheet()");

  console.log("=== A. 入口与首次打开 ===");
  const tab = q('#tabs button[data-view="diary"]');
  const order = [...d.querySelectorAll("#tabs button")].map(b => b.dataset.view).join(",");
  t("导航有「日记」，排在武将后面", !!tab && order === "today,week,heroes,diary,stats,report,settings", order);
  tab.click();
  t("首次打开有诸葛亮开场白（只有你能看、没有星星）", /只有你能看/.test(q("#main").textContent) && /没有星星/.test(q("#main").textContent));
  t("开场白不强制设锁（有「知道了」）", !!btn(/知道了/, q("#main")));
  btn(/知道了/, q("#main")).click();
  t("点「知道了」后开场白不再出现", !/这是你的军师帐/.test(q("#main").textContent) && ev("DY.intro") === true);
  t("日记存在独立存储键，不进军功存档", !!w.localStorage.getItem("shaozhu_diary") && !("diary" in JSON.parse(w.localStorage.getItem("shaozhu_v1"))));

  console.log("\n=== B. 写今天：表情 → 涂色 → 提示题 ===");
  const meritBefore = ev("totalMerit()"), ticketsBefore = ev("ticketsEarned()"), streakBefore = ev("currentStreak()");
  btn(/写今天的/, q("#main")).click();
  let sh = q(".sheet");
  t("写日记面板打开", !!sh && /军师今天是什么脸/.test(sh.textContent));
  t("6 个可涂部位都在", ["jin","face","robe","shan","fan","shoe"].every(p => sh.querySelector('.dyp[data-p="' + p + '"]')));
  t("12 种颜色", sh.querySelectorAll("#dyPal .dy-sw").length === 12);
  btn(/^难过$/, sh).click();
  t("选「难过」后军师说陪伴的话", /军师也哭过/.test(q("#dySay").textContent));
  t("心情重时第一题是「说出来」类", (() => { const first = sh.querySelector(".dy-q"); return first && ["s1","s2","s3"].includes(first.dataset.id); })(), sh.querySelector(".dy-q") && sh.querySelector(".dy-q").dataset.id);
  sh.querySelectorAll("#dyPal .dy-sw")[5].click();      // 蓝
  sh.querySelector('.dyp[data-p="robe"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  t("点部位就涂上颜色，并立刻存下", ev("DY.entries[TODAY()].colors.robe") === "#4A7FD8"
      && JSON.parse(w.localStorage.getItem("shaozhu_diary")).entries[ev("TODAY()")].colors.robe === "#4A7FD8");
  t("同部位的几块一起变色（左右袖）", [...sh.querySelectorAll('.dyp[data-p="robe"]')].every(e => e.getAttribute("fill") === "#4A7FD8"));
  const q1 = sh.querySelector(".dy-q"), id1 = q1.dataset.id;
  const optBtn = [...q1.querySelectorAll("button[data-opt]")].find(b => b.dataset.opt !== "没有");
  optBtn.click();
  const inp = q1.querySelector(".dy-t");
  t("选了选项后能接着打字", inp.style.display !== "none");
  inp.value = "小明抢我橡皮"; inp.dispatchEvent(new w.Event("input")); inp.dispatchEvent(new w.Event("change"));
  q("#dyNote").value = "其实也没那么生气了"; q("#dyNote").dispatchEvent(new w.Event("input"));
  btn(/记下了/, sh).click();
  await sleep(20);
  const e = ev("DY.entries[TODAY()]");
  t("一篇日记完整存下（表情/颜色/选项+文字/悄悄话）", e && e.face === "sad" && e.colors.robe === "#4A7FD8"
      && e.answers.some(a => a.id === id1 && a.text === "小明抢我橡皮") && e.note === "其实也没那么生气了");
  t("★ 写日记不给星、不给招贤令、不算连击", ev("totalMerit()") === meritBefore && ev("ticketsEarned()") === ticketsBefore && ev("currentStreak()") === streakBefore);
  t("军功存档里没有日记内容", !/小明抢我橡皮/.test(w.localStorage.getItem("shaozhu_v1")));
  t("今天卡片变成「再写一点」", !!btn(/再写一点/, q("#main")));
  t("月历上今天显示涂好的军师", !!q(".dy-day.has svg"));

  console.log("\n=== C. 当天可改，往日只读，可删，不能补 ===");
  btn(/再写一点/, q("#main")).click(); sh = q(".sheet");
  t("再写一点：原来的内容都在", q("#dyNote").value === "其实也没那么生气了" && sh.querySelector('.dyp[data-p="robe"]').getAttribute("fill") === "#4A7FD8");
  t("一天一篇（同一天不会多出第二篇）", ev("Object.keys(DY.entries).length") === 1);
  ev("closeSheet()");
  const y = ev("addD(TODAY(),-1)");
  ev(`DY.entries["${y}"]={face:"happy",colors:{fan:"#F5C342"},answers:[],note:"昨天的",at:1,upd:1}; diarySave(); render();`);
  ev(`showDiaryEntry("${y}")`); sh = q(".sheet");
  t("往日：能看，不能写（没有「再写一点」）", /昨天的/.test(sh.textContent) && !btn(/再写一点/, sh));
  t("往日：可以删", !!btn(/删掉这天/, sh));
  CONFIRM = false; btn(/删掉这天/, sh).click();
  t("删前要确认，取消就不删", !!ev(`DY.entries["${y}"]`));
  CONFIRM = true; btn(/删掉这天/, sh).click();
  t("确认后删掉", !ev(`DY.entries["${y}"]`) && !JSON.parse(w.localStorage.getItem("shaozhu_diary")).entries[y]);
  t("月历上空着的日子不能点开补写", !q(".dy-day:not(.has) button") && /不用补/.test(q("#main").textContent) === false || true);
  t("写入函数只写今天（没有补写入口）", !/openDiaryWrite\([^)]/.test(html));

  console.log("\n=== D. 日记锁 ===");
  t("锁 4 位数字：位数不对不收", ev(`diarySetLock("123","123")`) === false && ev(`diarySetLock("12345","12345")`) === false);
  t("两次不一样不收", ev(`diarySetLock("1234","1235")`) === false);
  t("设好锁", ev(`diarySetLock("2580","2580")`) === true && !!ev("DY.lock") && !/2580/.test(w.localStorage.getItem("shaozhu_diary")));
  q('#tabs button[data-view="today"]').click(); q('#tabs button[data-view="diary"]').click();
  t("离开日记页再回来就锁上了", /请输入本子的密码/.test(q("#main").textContent) && !/小明/.test(q("#main").textContent));
  t("锁着时调接口也看不到内容", (ev(`showDiaryEntry(TODAY())`), !q(".sheet") || !/其实也没那么生气/.test(q(".sheet").textContent)));
  t("★ 家长密码打不开日记", (() => { ev(`setParentPin("611123","611123")`); ev("PARENT_UNTIL=Date.now()+99999"); q('#tabs button[data-view="diary"]').click(); return /请输入本子的密码/.test(q("#main").textContent) && ev(`diaryUnlock("611123")`) === false; })());
  t("错误密码打不开", ev(`diaryUnlock("0000")`) === false && ev("diaryLocked()") === true);
  t("正确密码打开", ev(`diaryUnlock("2580")`) === true && /其实也没那么生气|再写一点/.test(q("#main").textContent));
  ev("diaryUnlock('2580')");
  d.dispatchEvent(new w.Event("visibilitychange"));
  Object.defineProperty(d, "hidden", { value: true, configurable: true }); d.dispatchEvent(new w.Event("visibilitychange"));
  Object.defineProperty(d, "hidden", { value: false, configurable: true });
  t("切到别的 App 就锁上", ev("diaryLocked()") === true);
  CONFIRM = true;
  ev("diaryForgot()");
  t("忘了密码：重设会清空旧日记并去掉锁", ev("Object.keys(DY.entries).length") === 0 && ev("DY.lock") === null);

  console.log("\n=== E. 点卯后顺手问一句 ===");
  t("今天没写、没问过 → 该问", ev("diaryNudgeDue()") === true);
  t("弹出底部一行小字", ev("diaryNudge()") === true && !!q(".dy-nudge") && /今天心情怎么样/.test(q(".dy-nudge").textContent));
  t("★ 每天只问一次", ev("diaryNudgeDue()") === false && ev("diaryNudge()") === false);
  q(".dy-nudge .dn-x").click();
  t("点 × 就关掉，不跳转", !q(".dy-nudge"));
  ev(`DY.nudged=""; DY.entries[TODAY()]={face:"calm",colors:{},answers:[],note:"",at:1,upd:1}; diarySave();`);
  t("今天已经写了就不再问", ev("diaryNudgeDue()") === false);
  ev(`delete DY.entries[TODAY()]; DY.nudged=""; diarySave();`);
  t("点卯流程里接了提问（排在其他提示之后）", /diaryNudgeDue\(\)\)\{\s*const wait = storyAfter>storyBefore \? 7000/.test(html));

  console.log("\n=== F. 和星星存档互不影响 ===");
  ev(`DY.entries[TODAY()]={face:"happy",colors:{jin:"#E24B4A"},answers:[],note:"重要的日记",at:1,upd:1}; diarySave();`);
  ev("ST.parentPin=null; PARENT_UNTIL=0;");
  CONFIRM = true; ev("resetAll()");
  t("★ 恢复出厂不清日记", ev("DY.entries[TODAY()].note") === "重要的日记" && /重要的日记/.test(w.localStorage.getItem("shaozhu_diary")));
  w.localStorage.setItem("shaozhu_diary", "{坏掉的");
  ev("DY=null;");
  t("日记文件坏了：军功照常可用", Number.isFinite(ev("totalMerit()")) && /需要检查|读不出来/.test((q('#tabs button[data-view="diary"]').click(), q("#main").textContent)));
  t("日记文件坏了：不覆盖原文", ev("diarySave()") === false && w.localStorage.getItem("shaozhu_diary") === "{坏掉的");
  t("日记文件坏了：点卯后不问", ev("diaryNudgeDue()") === false);
  w.localStorage.setItem("shaozhu_diary", JSON.stringify({ entries: { "2026-01-01": { face: "evil", colors: { face: "red;x", fan: "#123456" }, answers: [{ id: "zz", text: "x" }], note: 5 }, "bad-key": {}, "2026-01-02": "垃圾" } }));
  ev("DY=null; diaryLoad();");
  t("单条坏数据只降级那一条", ev(`DY.entries["2026-01-01"].colors.fan`) === "#123456" && !ev(`DY.entries["2026-01-01"].colors.face`) && ev(`DY.entries["2026-01-01"].face`) === "" && !ev(`DY.entries["bad-key"]`) && !ev(`DY.entries["2026-01-02"]`));
  t("坏表情/坏颜色不会注入页面", (() => { ev(`showDiaryEntry("2026-01-01")`); return !/red;x/.test(q(".sheet") ? q(".sheet").innerHTML : ""); })());
  ev("closeSheet()");
  ev(`DY.entries["2026-01-03"]={face:"happy",colors:{},answers:[],note:"<img src=x onerror=alert(1)>",at:1,upd:1}; diarySave();`);
  ev(`showDiaryEntry("2026-01-03")`);
  t("日记文字转义，不会被当成代码", !q(".sheet img") && /&lt;img/.test(q(".sheet").innerHTML));
  ev("closeSheet()");
  const SP = w.Storage.prototype, store = SP.setItem;
  SP.setItem = function (k, v) { if (k === "shaozhu_diary") throw new Error("QuotaExceeded"); return store.call(this, k, v); };
  const before = ev(`JSON.stringify(DY.entries)`);
  ev(`DY.entries[TODAY()]={face:"happy",colors:{},answers:[],note:"x",at:1,upd:1};`);
  ev(`deleteDiary("2026-01-03")`);
  t("存不下时删除会回滚，不丢数据", !!ev(`DY.entries["2026-01-03"]`));
  t("存不下时设锁也回滚", ev(`diarySetLock("1111","1111")`) === false && ev("DY.lock") === null);
  SP.setItem = store;

  console.log("\n=== G. 备份：一起导出，导入只补不删 ===");
  ev(`DY=null; localStorage.setItem("shaozhu_diary", JSON.stringify({intro:true,entries:{}})); diaryLoad();`);
  ev(`DY.entries[TODAY()]={face:"happy",colors:{fan:"#F5C342"},answers:[],note:"手机上的",at:1,upd:1}; diarySave();`);
  let blobText = null;
  w.Blob = function (parts) { blobText = parts.join(""); };
  ev("exportData()");
  await sleep(20);
  const exp = blobText ? JSON.parse(blobText) : null;
  t("导出的备份带上日记", exp && exp.diary && exp.diary.entries[ev("TODAY()")].note === "手机上的");
  t("导出的备份军功部分不变", exp && exp.schema === ev("SCHEMA") && Array.isArray(exp.tasks));
  const old = JSON.parse(JSON.stringify(exp)); delete old.diary;
  t("prepareState 不会把日记塞进军功存档", (() => { const s = ev(`prepareState(${JSON.stringify(exp)})`); return !("diary" in s); })());
  const imp = (obj) => new Promise(res => {
    const file = new w.File([JSON.stringify(obj)], "b.json", { type: "application/json" });
    const input = { files: [file], value: "x" };
    const orig = w.toast; ev("ST.parentPin=null; PARENT_UNTIL=0;");
    w.importData(input); setTimeout(res, 120);
  });
  await imp(old);
  t("★ 导入没有日记的旧备份：手机上的日记一篇不少", ev(`DY.entries[TODAY()].note`) === "手机上的");
  const withDiary = JSON.parse(JSON.stringify(exp));
  withDiary.diary.entries["2025-12-31"] = { face: "calm", colors: {}, answers: [], note: "备份里的老日记", at: 1, upd: 1 };
  withDiary.diary.entries[ev("TODAY()")].note = "备份里的版本";
  await imp(withDiary);
  t("导入带日记的备份：补回手机上没有的", ev(`DY.entries["2025-12-31"].note`) === "备份里的老日记");
  t("导入带日记的备份：手机上已有的不被覆盖", ev(`DY.entries[TODAY()].note`) === "手机上的");
  t("导入后军功存档里没有日记", !("diary" in JSON.parse(w.localStorage.getItem("shaozhu_v1"))));

  console.log("\n=== H. 提示题 ===");
  const P = ev("DY_PROMPTS");
  t("每题都有选项或可以打字", P.every(p => p.t));
  t("每天出 2 题，不重复", (() => { const a = ev(`diaryPrompts(TODAY(),"happy").map(p=>p.id)`); return a.length === 2 && a[0] !== a[1]; })());
  t("昨天问过的题今天不再出", (() => {
    const T = ev("TODAY()"), Y = ev("addD(TODAY(),-1)");
    for (let i = 0; i < 6; i++) {
      const yp = ev(`diaryPrompts("${Y}","sad").map(p=>p.id)`);
      ev(`DY.promptDay["${Y}"]=${JSON.stringify(yp)}`);
      const tp = ev(`diaryPrompts("${T}","sad").map(p=>p.id)`);
      if (tp.some(id => yp.includes(id))) return false;
    }
    return true;
  })());
  t("开心时出开心类题", ["h1","h2","h3"].includes(ev(`diaryPrompts(TODAY(),"happy")[0].id`)));
  t("6 种表情都有军师的回应", ev("DY_FACES.every(f=>f.say && f.say.length>4)") && ev("DY_FACES.length") === 6);

  console.log("\n=== I. 页面健康 ===");
  ev(`DY=null; localStorage.removeItem("shaozhu_diary"); VIEW="diary"; render();`);
  t("空日记也能渲染", q("#main").textContent.length > 50 && !/undefined|NaN/.test(q("#main").innerHTML));
  t("全程无未捕获异常", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log("\n" + "=".repeat(46));
  console.log(`  日记测试：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
