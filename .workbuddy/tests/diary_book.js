/* 日记本（v2.5.0）测试：真实 DOM 点击 + 旧日记迁移 + 存储隔离 + 锁 + 导入导出
   用法：NODE_PATH=<workspace>/node_modules node .workbuddy/tests/diary_book.js */
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
const t = (n, ok, x) => { if (ok) { pass++; console.log("  ✅ " + n); } else { fail++; console.log("  ❌ " + n + (x !== undefined ? "  → " + x : "")); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let dom = make();
  let w = dom.window, d = w.document;
  let ev = c => w.eval(c);
  const q = s => d.querySelector(s);
  const btn = (re, root) => [...(root || d).querySelectorAll("button")].find(b => re.test(b.textContent));
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input")); };
  const stored = () => JSON.parse(w.localStorage.getItem("shaozhu_diary") || "{}");
  await sleep(450); ev("closeSheet()");

  console.log("=== A. 入口与首次打开 ===");
  const tab = q('#tabs button[data-view="diary"]');
  const order = [...d.querySelectorAll("#tabs button")].map(b => b.dataset.view).join(",");
  t("导航有「日记」，保留原栏目顺序并包含家业", !!tab && order === "today,week,heroes,jiaye,diary,stats,report,settings", order);
  t("版本 2.5.x", /^2\.[5-9]\./.test(ev("APP_VERSION")));
  tab.click();
  t("首次打开：这是你的日记本、只有你能看、没有星星", /这是你的日记本/.test(q("#main").textContent) && /只有你能看/.test(q("#main").textContent) && /没有星星/.test(q("#main").textContent));
  btn(/知道了/, q("#main")).click();
  t("点「知道了」后开场白不再出现", !/这是你的日记本/.test(q("#main").textContent) && ev("DY.intro") === true);
  t("日记存在独立存储键，不进军功存档", !!w.localStorage.getItem("shaozhu_diary") && !("diary" in JSON.parse(w.localStorage.getItem("shaozhu_v1"))));

  console.log("\n=== B. 写今天：正文是主角 ===");
  const meritBefore = ev("totalMerit()"), ticketsBefore = ev("ticketsEarned()");
  btn(/写今天的日记/, q("#main")).click();
  let sh = q(".sheet");
  const ta = () => q("#dyText");
  t("写日记面板打开，标题是日期+星期", !!sh && sh.querySelector("h3").textContent === ev("dyDateLine(TODAY())"), sh && sh.querySelector("h3").textContent);
  t("没有「悄悄话」、没有一题一题的问答", !/悄悄话/.test(sh.textContent) && !sh.querySelector(".dy-q"));
  t("正文本子在表情/涂色前面", (() => { const all = [...sh.querySelectorAll("#dyText, #dyFaces, #dyFig")]; return all[0] && all[0].id === "dyText"; })());
  t("表情和涂色收在「可以不涂」里，默认收起", !!sh.querySelector("details.dy-more") && !sh.querySelector("details.dy-more").open);
  t("6 种天气", sh.querySelectorAll("#dyWeather button").length === 6);
  t("每天 3 句开头", sh.querySelectorAll("#dySt button").length === 3);
  t("6 个可涂部位、12 种颜色都还在", ["jin","face","robe","shan","fan","shoe"].every(p => sh.querySelector('.dyp[data-p="' + p + '"]')) && sh.querySelectorAll("#dyPal .dy-sw").length === 12);

  sh.querySelector('#dyWeather button[data-w="rain"]').click();
  t("点天气就存", ev("DY.entries[TODAY()]") && ev("DY.entries[TODAY()].weather") === "rain");
  const st1 = sh.querySelector("#dySt button"), st1Text = ev(`DY_STARTER_BY_ID["${st1.dataset.st}"].s`);
  st1.click();
  t("点一句开头 → 直接写进正文", ta().value === st1Text, ta().value);
  type(ta(), ta().value + "下课和小明一起玩老鹰捉小鸡。");
  const st2 = sh.querySelectorAll("#dySt button")[2], st2Text = ev(`DY_STARTER_BY_ID["${st2.dataset.st}"].s`);
  st2.click();
  t("再点一句开头 → 换行接在后面，不覆盖", ta().value === st1Text + "下课和小明一起玩老鹰捉小鸡。\n" + st2Text, JSON.stringify(ta().value));
  type(ta(), ta().value + "去公园");
  await sleep(800);
  t("边写边存（不用点按钮）", stored().entries && /去公园/.test(stored().entries[ev("TODAY()")].text));
  type(ta(), ta().value + "放风筝");
  ev("closeSheet()");
  t("没点「写好了」直接关掉，最后几个字也存下了", /去公园放风筝/.test(stored().entries[ev("TODAY()")].text));
  t("写日记不给星、不给招贤令", ev("totalMerit()") === meritBefore && ev("ticketsEarned()") === ticketsBefore);

  console.log("\n=== C. 接着写、涂色、表情 ===");
  ev("render()");
  t("今天卡片显示第一行 + 「接着写」", /接着写/.test(q("#main").textContent) && q("#main").textContent.includes(st1Text));
  btn(/接着写/, q("#main")).click(); sh = q(".sheet");
  t("接着写：原来的字和天气都在", /去公园放风筝/.test(ta().value) && sh.querySelector('#dyWeather button[data-w="rain"]').classList.contains("on"));
  btn(/^难过$/, sh).click();
  t("选「难过」→ 军师说陪伴的话", /军师也哭过/.test(q("#dySay").textContent));
  t("心情重时，开头换成「说出来」类（前两句）", [...sh.querySelectorAll("#dySt button")].slice(0, 2).every(b => /^s/.test(b.dataset.st)), [...sh.querySelectorAll("#dySt button")].map(b => b.dataset.st).join());
  t("换表情不会动正文", /去公园放风筝/.test(ta().value));
  sh.querySelectorAll("#dyPal .dy-sw")[5].click();
  sh.querySelector('.dyp[data-p="robe"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  t("涂色存下", ev("DY.entries[TODAY()].colors.robe") === "#4A7FD8");
  btn(/写好了/, sh).click();
  t("点「写好了」关上并回到日记页", !q(".sheet") && ev("VIEW") === "diary");
  const e = stored().entries[ev("TODAY()")];
  t("一篇完整存下：天气/表情/颜色/正文", e.weather === "rain" && e.face === "sad" && e.colors.robe === "#4A7FD8" && /老鹰捉小鸡/.test(e.text));
  t("存档里不再有 answers/note 旧字段", !("answers" in e) && !("note" in e));
  t("清空正文、天气、表情、颜色 → 这天不留空壳", (() => {
    btn(/接着写/, q("#main")).click(); const s = q(".sheet");
    type(ta(), ""); s.querySelector('#dyWeather button.on').click(); btn(/^难过$/, s).click(); q("#dyWipe").click();
    const gone = !ev("DY.entries[TODAY()]");
    ev("closeSheet()");
    ev(`DY.entries[TODAY()]=${JSON.stringify(e)}; diarySave(); render();`);
    return gone;
  })());

  console.log("\n=== D. 翻日记：一篇篇 / 月历 / 前后翻页 ===");
  const T = ev("TODAY()"), y1 = ev("addD(TODAY(),-1)"), y3 = ev("addD(TODAY(),-3)");
  ev(`DY.entries["${y1}"]={face:"happy",weather:"sun",colors:{fan:"#F5C342"},text:"昨天去了动物园\\n看到大熊猫",at:1,upd:1};
      DY.entries["${y3}"]={face:"",weather:"",colors:{jin:"#E24B4A"},text:"",at:1,upd:1}; diarySave(); render();`);
  const sameMonth = y1.slice(0, 7) === T.slice(0, 7);
  if (sameMonth) {
    const items = [...d.querySelectorAll(".dy-list .dy-item")];
    t("一篇篇：新的在上", items.length >= 2 && /今天|/.test(items[0].textContent) && items[0].textContent.includes(ev(`dyDateLine("${T}")`)));
    t("列表里能看到那天的第一句话", items.some(i => /昨天去了动物园/.test(i.textContent) && !/大熊猫/.test(i.textContent)));
    t("只涂了军师的那天也列出来", y3.slice(0, 7) !== T.slice(0, 7) || items.some(i => /只涂了军师/.test(i.textContent)));
  } else { t("（跨月日期，跳过列表检查）", true); t("-", true); t("-", true); }
  ev(`diaryShow("cal")`);
  t("切到月历：有日记的日子是军师小图", d.querySelectorAll(".dy-grid .dy-day.has").length >= 1 && ev("DY_SHOW") === "cal");
  ev(`diaryShow("list")`);
  ev(`showDiaryEntry("${y1}")`); sh = q(".sheet");
  t("读往日：正文完整、天气、心情都在", /昨天去了动物园/.test(sh.textContent) && /看到大熊猫/.test(sh.textContent) && /晴/.test(sh.textContent) && /开心/.test(sh.textContent));
  t("往日只读：没有「接着写」、没有输入框", !btn(/接着写/, sh) && !sh.querySelector("textarea"));
  t("正文换行保留（pre-wrap）", sh.querySelector(".dy-page-t") && sh.querySelector(".dy-page-t").textContent === "昨天去了动物园\n看到大熊猫");
  btn(/后一篇/, sh).click(); sh = q(".sheet");
  t("「后一篇」翻到今天，今天可以接着写", sh.textContent.includes(ev(`dyDateLine("${T}")`)) && !!btn(/接着写/, sh));
  t("最新一篇「后一篇」不能点", btn(/后一篇/, sh).disabled === true);
  btn(/前一篇/, sh).click(); btn(/前一篇/, q(".sheet")).click(); sh = q(".sheet");
  t("「前一篇」跳过没写的日子", sh.textContent.includes(ev(`dyDateLine("${y3}")`)) && /只涂了军师/.test(sh.textContent));
  CONFIRM = false; btn(/删掉这天/, sh).click();
  t("删除要确认，取消就不删", !!ev(`DY.entries["${y3}"]`));
  CONFIRM = true; btn(/删掉这天/, q(".sheet")).click();
  t("确认后删掉", !ev(`DY.entries["${y3}"]`) && !stored().entries[y3]);
  ev("closeSheet()");

  console.log("\n=== E. 旧日记（2.4.0）一个字都不丢 ===");
  {
    const old = { v: 1, intro: true, lock: null, nudged: "", promptDay: { "2026-11-02": ["s1", "m2"] }, entries: {
      "2026-11-02": { face: "angry", colors: { robe: "#E24B4A" }, answers: [{ id: "s2", pick: "有", text: "小明抢我橡皮" }, { id: "m2", pick: "", text: "红烧肉" }], note: "其实也没那么生气了", at: 1, upd: 1 },
      "2026-11-01": { face: "happy", colors: {}, answers: [{ id: "h1", pick: "好朋友", text: "" }], note: "", at: 1, upd: 1 },
      "2026-10-31": { face: "", colors: {}, answers: [{ id: "zz", pick: "", text: "未知题目的回答" }], note: "", at: 1, upd: 1 }
    } };
    const dom2 = make(null, JSON.stringify(old)); const w2 = dom2.window; await sleep(450); w2.eval("closeSheet()");
    w2.eval("diaryLoad()"); const E = k => w2.eval(`DY.entries["${k}"]`);
    const a = E("2026-11-02");
    t("旧题目和回答变成正文", a && a.text.includes("今天有没有一件事让你很生气？") && a.text.includes("有，小明抢我橡皮") && a.text.includes("今天最好吃的是什么？\n红烧肉"), a && JSON.stringify(a.text));
    t("旧悄悄话接在正文最后", a && /其实也没那么生气了$/.test(a.text));
    t("表情、颜色保留", a && a.face === "angry" && a.colors.robe === "#E24B4A");
    t("只点了选项的也保留", E("2026-11-01") && /好朋友/.test(E("2026-11-01").text));
    t("题目对不上的回答也不丢", E("2026-10-31") && /未知题目的回答/.test(E("2026-10-31").text));
    t("旧的 promptDay 只留合法的开头编号", w2.eval(`Object.values(DY.promptDay).flat().every(id=>DY_STARTER_BY_ID[id])`));
    w2.eval(`VIEW="diary"; DY_MONTH="2026-11"; render();`);
    t("迁移后列表正常显示", /今天有没有一件事让你很生气/.test(w2.document.querySelector("#main").textContent));
    w2.eval(`DY.entries["2026-11-01"].weather="sun"; diarySave();`);
    const s2 = JSON.parse(w2.localStorage.getItem("shaozhu_diary"));
    t("保存后变成新格式（text），旧字段去掉", typeof s2.entries["2026-11-02"].text === "string" && !("answers" in s2.entries["2026-11-02"]) && /红烧肉/.test(s2.entries["2026-11-02"].text));
    const dom3 = make(null, JSON.stringify(s2)); await sleep(450); dom3.window.eval("diaryLoad()");
    t("再打开一次：新格式不会被二次转换", dom3.window.eval(`DY.entries["2026-11-02"].text`) === s2.entries["2026-11-02"].text);
    dom2.window.close(); dom3.window.close();
  }

  console.log("\n=== F. 开头的话 ===");
  {
    const S = ev("DY_STARTERS");
    t("开头都是三年级能看懂的短句（≤12 字）", S.every(s => s.s.length <= 12), S.filter(s => s.s.length > 12).map(s => s.s).join());
    t("开心/难过/日常三类都有", ["good", "heavy", "small"].every(c => S.filter(s => s.c === c).length >= 3));
    let clash = 0;
    for (let i = 0; i < 20; i++) {
      const D = ev(`addD(TODAY(),${i})`), Y = ev(`addD("${D}",-1)`);
      const yp = ev(`diaryStarters("${Y}","happy").map(p=>p.id)`);
      ev(`DY.promptDay["${Y}"]=${JSON.stringify(yp)}`);
      const tp = ev(`diaryStarters("${D}","happy").map(p=>p.id)`);
      if (tp.some(x => yp.includes(x)) || new Set(tp).size !== 3) clash++;
    }
    t("连续 20 天：不和昨天重复、当天 3 句互不相同", clash === 0, clash);
    t("心情难过时出「说出来」的开头", ev(`diaryStarters(TODAY(),"sad").slice(0,2).every(p=>p.c==="heavy")`));
  }

  console.log("\n=== G. 锁 ===");
  ev(`DY_OPEN=true; diarySetLock("2580","2580")`);
  ev(`VIEW="settings"; render(); VIEW="diary"; render();`);
  t("离开再回来就上锁，看不到正文", /请输入本子的密码/.test(q("#main").textContent) && !/动物园/.test(q("#main").textContent));
  ev(`showDiaryEntry("${y1}")`);
  t("锁着时不能直接打开某一天", !q(".sheet") || !/动物园/.test(q(".sheet").textContent));
  t("错误密码打不开", ev(`diaryUnlock("1111")`) === false);
  { const fam=String.fromCharCode(54,49,49,49,50,51), fw=[...fam].map(c=>String.fromCharCode(c.charCodeAt(0)+0xFEE0)).join("");
    t("家里的公用口令也能打开日记锁", ev("diaryUnlock("+JSON.stringify(fam)+")") === true); ev("diaryRelock()");
    t("公用口令输全角也能打开", ev("diaryUnlock("+JSON.stringify(fw)+")") === true); ev("diaryRelock()");
    t("密码框能输 6 位（装得下公用口令）", (ev("VIEW=\"diary\"; render()"), q("#dyPin").maxLength === 6));
    const n0 = Object.keys(ev("DY.entries")).length; ev("diaryForgot()");
    t("「忘了密码」不再清空日记、锁也还在", Object.keys(ev("DY.entries")).length === n0 && n0 > 0 && !!ev("DY.lock") && ev("diaryLocked()") === true);
    t("锁屏写明公用口令也能开", /公用口令/.test(q("#main").textContent)); }
  t("正确密码打开", ev(`diaryUnlock("2580")`) === true && /接着写|动物园/.test(q("#main").textContent));
  btn(/接着写/, q("#main")).click(); type(ta(), ta().value + "切后台前写的");
  Object.defineProperty(d, "hidden", { configurable: true, get: () => true });
  d.dispatchEvent(new w.Event("visibilitychange"));
  Object.defineProperty(d, "hidden", { configurable: true, get: () => false });
  t("写到一半切后台：字存下了，面板关掉，本子锁上", /切后台前写的/.test(stored().entries[T].text) && !q(".sheet") && ev("diaryLocked()") === true);
  ev(`diaryUnlock("2580")`); ev(`DY.lock=null; diarySave();`);

  console.log("\n=== H. 安全与容错 ===");
  ev(`DY.entries[TODAY()].text="<img src=x onerror=alert(1)>"; diarySave(); render(); showDiaryEntry(TODAY());`);
  t("正文里的尖括号原样显示，不执行", !d.querySelector(".sheet img") && /<img src=x/.test(q(".sheet").textContent) && !d.querySelector("#main img[src=x]"));
  ev("closeSheet()");
  {
    const bad = { entries: { "2026-01-01": { face: "evil", weather: "lava", colors: { face: "red;x", fan: "#123456" }, text: 5, note: "旧备注" }, "bad-key": {}, "2026-01-02": "垃圾" } };
    const dom4 = make(null, JSON.stringify(bad)); await sleep(450); dom4.window.eval("diaryLoad()");
    const x = dom4.window.eval(`DY.entries["2026-01-01"]`);
    t("坏字段被丢掉，好的留下", x && x.face === "" && x.weather === "" && x.colors.fan === "#123456" && !x.colors.face);
    t("text 不是字符串时退回读旧备注", x && x.text === "旧备注");
    t("坏日期、坏条目整条丢掉，不影响别的", Object.keys(dom4.window.eval("DY.entries")).join() === "2026-01-01");
    dom4.window.close();
    const dom5 = make(null, "{坏掉的json"); await sleep(450);
    dom5.window.eval(`VIEW="diary"; render();`);
    t("日记文件坏了：提示、不写入、不覆盖原文", /原来的日记没有删/.test(dom5.window.document.querySelector("#main").textContent) && dom5.window.localStorage.getItem("shaozhu_diary") === "{坏掉的json");
    dom5.window.close();
  }
  t("正文最长 5000 字", (() => { ev(`DY.entries["2026-02-02"]={text:"字".repeat(9000)}`); const c = ev(`dyCleanEntry(DY.entries["2026-02-02"]).text.length`); ev(`delete DY.entries["2026-02-02"]`); return c === 5000; })());
  {
    const proto = w.Storage.prototype, orig = proto.setItem;
    const keep = ev(`DY.entries[TODAY()].text`);
    btn(/接着写/, q("#main")) || ev("render()");
    ev("openDiaryWrite()");
    proto.setItem = function (k, v) { if (k === "shaozhu_diary") throw new Error("QuotaExceeded"); return orig.call(this, k, v); };
    type(ta(), "存不下的新内容"); btn(/写好了/, q(".sheet")).click();
    proto.setItem = orig;
    t("手机存不下时：不假装存好，内存里也退回原样", ev(`DY.entries[TODAY()].text`) === keep && !!q(".sheet"));
    ev("closeSheet()");
  }

  console.log("\n=== I. 备份、重置、点卯邀请 ===");
  {
    ev(`DY.entries[TODAY()]={face:"happy",weather:"sun",colors:{fan:"#F5C342"},text:"手机上的",at:1,upd:1}; diarySave();`);
    const exp = ev("JSON.stringify(Object.assign({},ST,{diary:diaryExport()}))");
    const o = JSON.parse(exp);
    t("导出带日记正文", o.diary && o.diary.entries[T].text === "手机上的");
    o.diary.entries["2025-12-31"] = { face: "calm", colors: {}, answers: [{ id: "m1", text: "学会了游泳" }], note: "备份里的老日记", at: 1, upd: 1 };
    o.diary.entries[T] = { text: "备份里的同一天", at: 1, upd: 1 };
    const added = ev(`diaryMergeImport(${JSON.stringify(o.diary)})`);
    t("导入：只补不删，同一天不覆盖手机上的", added === 1 && ev(`DY.entries[TODAY()].text`) === "手机上的");
    t("导入旧格式备份也转成正文", /学会了游泳/.test(ev(`DY.entries["2025-12-31"].text`)) && /备份里的老日记/.test(ev(`DY.entries["2025-12-31"].text`)));
    const n = Object.keys(stored().entries).length;
    ev("if(typeof resetAll==='function'){ const c=window.confirm; window.confirm=()=>true; try{ resetAll(); }catch(e){} window.confirm=c; }");
    t("恢复出厂不碰日记", Object.keys(stored().entries).length === n);
    ev(`DY.nudged=""; delete DY.entries[TODAY()]; diarySave();`);
    t("今天没写：点卯后会邀请一次", ev("diaryNudge()") === true && /今天过得怎么样/.test(q(".dy-nudge").textContent) && /写日记/.test(q(".dy-nudge").textContent));
    t("同一天不会再问第二次", ev("diaryNudge()") === false);
    q(".dy-nudge") && q(".dy-nudge").remove();
  }

  t("全程没有脚本错误", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log("\n==============================================");
  console.log("  日记本测试：" + pass + " 通过 / " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
