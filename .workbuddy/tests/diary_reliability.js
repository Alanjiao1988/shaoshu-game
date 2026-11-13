/* 日记故障回归：隔离真实 DOM、注入存储故障，不读取或改动用户存档。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "少年主公.html"), "utf8");
const KEY = "shaozhu_diary", DRAFT = KEY + "_draft_";
let pass = 0, fail = 0;
const cases = [];
const test = (name, action) => cases.push({ name, action });
function make(seed, storageSeed = {}) {
  const errors = [], timers = new Map();
  let timerId = 0;
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => {
    if (!/Not implemented|Could not parse CSS|getContext/.test(e.message)) errors.push(e.message);
  });
  const dom = new JSDOM(html, {
    runScripts: "dangerously", url: "http://localhost/index.html", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.confirm = () => true;
      w.alert = () => {};
      w.URL.createObjectURL = () => "blob:stub";
      w.URL.revokeObjectURL = () => {};
      w.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
      w.clearTimeout = id => timers.delete(id);
      const gate = (html.match(/const GATE_HASH = "([0-9a-f]*)"/) || [])[1];
      if (gate) w.localStorage.setItem("shaozhu_gate", gate);
      if (seed !== undefined) w.localStorage.setItem(KEY, typeof seed === "string" ? seed : JSON.stringify(seed));
      for (const [k, v] of Object.entries(storageSeed)) w.localStorage.setItem(k, v);
    }
  });
  const w = dom.window, d = w.document;
  const ev = code => w.eval(code), q = selector => d.querySelector(selector);
  ev('closeSheet(); VIEW="diary"; render();');
  return {
    w, d, ev, q, errors,
    type(text) { const ta = q("#dyText"); assert.ok(ta, "写作框应存在"); ta.value = text; ta.dispatchEvent(new w.Event("input")); return ta; },
    flushTimers() {
      for (const [id, timer] of [...timers]) if (timer.delay === 600) { timers.delete(id); timer.fn(); }
    },
    raw() { return w.localStorage.getItem(KEY); },
    stored() { return JSON.parse(w.localStorage.getItem(KEY) || "null"); },
    drafts() { return JSON.parse(ev("JSON.stringify(diaryDrafts())")); },
    snapshot() { return ev("JSON.stringify({DY,DY_LAST_RAW,DY_SAVED,DY_ERROR,DY_SAVE_ERROR,DY_OPEN})"); },
    dump() { const out = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); out[k] = w.localStorage.getItem(k); } return out; },
    hidden(value) { Object.defineProperty(d, "hidden", { configurable: true, get: () => value }); d.dispatchEvent(new w.Event("visibilitychange")); },
    fault(mode) {
      const p = w.Storage.prototype, get = p.getItem, set = p.setItem, remove = p.removeItem;
      p.getItem = function(k) { if (mode === "read" && k === KEY) throw new Error("读取故障"); return get.call(this, k); };
      p.setItem = function(k, v) {
        if ((mode === "diary" && k === KEY) || (mode === "all" && (k === KEY || k.startsWith(DRAFT)))) throw new Error("QuotaExceededError");
        return set.call(this, k, v);
      };
      p.removeItem = function(k) { return remove.call(this, k); };
      return () => { p.getItem = get; p.setItem = set; p.removeItem = remove; };
    },
    close() { dom.window.close(); }
  };
}
function book(text = "已保存正文") {
  return { v: 1, intro: true, lock: null, entries: { "2026-01-01": entry(text) }, promptDay: {}, nudged: "" };
}
function entry(text) { return { face: "", weather: "", colors: {}, text, at: 1, upd: 1 }; }
function open(c) {
  if (c.ev("DY_PRIVATE && !DY.lock")) {
    const reveal = [...c.q("#main").querySelectorAll("button")].find(b => /打开日记本/.test(b.textContent));
    assert.ok(reveal, "后台返回必须主动打开正文"); reveal.click();
  }
  assert.notEqual(c.ev("openDiaryWrite()"), false); assert.ok(c.q("#dyText"));
}
function today(c) { return c.ev("TODAY()"); }
function originalToday(c, text = "旧的今天") { c.ev(`DY.entries[TODAY()]=${JSON.stringify(entry(text))}; diarySave(); render();`); }
function background(c) { c.hidden(true); }

for (const method of ["按钮", "遮罩", "Escape", "closeSheet", "替换弹窗"]) {
  test("配额不足时" + method + "不能销毁草稿，恢复存储后可重试", c => {
    originalToday(c);
    const before = c.raw(), restore = c.fault("diary");
    open(c);
    const ta = c.type("失败后仍可重试的正文"), sheet = c.q(".sheet");
    if (method === "按钮") c.q("#dyDone").click();
    else if (method === "遮罩") c.q(".mask").dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));
    else if (method === "Escape") c.d.dispatchEvent(new c.w.KeyboardEvent("keydown", { key: "Escape" }));
    else if (method === "closeSheet") assert.equal(c.ev("closeSheet()"), false);
    else assert.equal(c.ev('openSheet("<h3>不应替换</h3>")'), false);
    assert.equal(c.q(".sheet"), sheet);
    assert.equal(ta.value, "失败后仍可重试的正文");
    assert.equal(c.ev("typeof DY_FLUSH"), "function");
    assert.equal(c.raw(), before);
    assert.equal(c.ev("DY.entries[TODAY()].text"), "旧的今天");
    assert.equal(c.drafts()[0].draft.text, ta.value);
    assert.match(c.q("#dySaveStatus").textContent, /仍未存入|尚未/);
    assert.ok(Object.keys(c.dump()).some(k => k.startsWith(DRAFT)), "本地草稿必须确实落盘");
    restore();
    c.q("#dyDone").click();
    assert.equal(c.q(".sheet"), null);
    assert.equal(c.stored().entries[today(c)].text, "失败后仍可重试的正文");
    assert.equal(c.drafts().length, 0);
    assert.equal(ta.value, "", "关闭成功也清除已脱离 DOM 的输入框");
    assert.equal(ta.textContent, "");
  });
}

test("刷新前未改变正文也能保存天气、表情和颜色", c => {
  open(c);
  c.q('#dyWeather [data-w="rain"]').click();
  assert.equal(c.stored().entries[today(c)].weather, "rain");
  c.q('#dyFaces [data-f="sad"]').click();
  assert.equal(c.stored().entries[today(c)].face, "sad");
  c.q('.dyp[data-p="fan"]').dispatchEvent(new c.w.MouseEvent("click", { bubbles: true }));
  assert.equal(c.stored().entries[today(c)].colors.fan, "#F5C342");
  c.q("#dyWipe").click();
  assert.deepEqual(c.stored().entries[today(c)].colors, {});
});

test("自动保存失败后普通关闭不会丢失重试入口", c => {
  const restore = c.fault("diary");
  open(c); c.type("自动保存未成功"); c.flushTimers();
  assert.equal(c.ev("closeSheet()"), false);
  assert.ok(c.q("#dyText"));
  restore();
  assert.equal(c.ev("closeSheet()"), true);
  assert.equal(c.stored().entries[today(c)].text, "自动保存未成功");
});

test("关闭钩子抛错时保留面板与钩子", c => {
  open(c); c.type("不能被异常吞掉");
  c.ev('DY_FLUSH=()=>{throw new Error("注入关闭故障")};');
  assert.equal(c.ev("closeSheet()"), false);
  assert.ok(c.q("#dyText"));
  assert.equal(c.ev("typeof DY_FLUSH"), "function");
  assert.equal(c.drafts()[0].draft.text, "不能被异常吞掉");
});

for (const mode of ["diary", "all"]) {
  test("后台隐私清理保留" + (mode === "all" ? "内存" : "本地") + "失败草稿，解锁后可恢复", c => {
    originalToday(c, "敏感旧正文");
    assert.equal(c.ev('diarySetLock("2580","2580")'), true);
    const restore = c.fault(mode);
    open(c); const ta = c.type("私密未保存新正文");
    background(c);
    assert.equal(c.q(".sheet"), null);
    assert.equal(ta.value, ""); assert.equal(ta.textContent, "");
    assert.equal(c.ev("DY_OPEN"), false);
    assert.equal(c.ev("DY_FLUSH"), null);
    assert.equal(c.ev("DY_HIDE"), null);
    assert.doesNotMatch(c.q("#main").textContent, /敏感旧正文|私密未保存新正文/);
    assert.equal(c.drafts()[0].draft.text, "私密未保存新正文");
    if (mode === "all") assert.ok(!Object.keys(c.dump()).some(k => k.startsWith(DRAFT)));
    else assert.ok(Object.keys(c.dump()).some(k => k.startsWith(DRAFT)));
    restore(); c.hidden(false);
    assert.equal(c.ev('diaryUnlock("2580")'), true);
    open(c); assert.equal(c.q("#dyText").value, "私密未保存新正文");
    c.q("#dyDone").click();
    assert.equal(c.stored().entries[today(c)].text, "私密未保存新正文");
  });
}

test("未设置锁时后台及恢复前也不渲染敏感正文", c => {
  originalToday(c, "无锁敏感正文"); open(c); const ta = c.q("#dyText");
  background(c);
  assert.equal(c.q(".sheet"), null); assert.equal(ta.value, "");
  assert.doesNotMatch(c.q("#main").textContent, /无锁敏感正文/);
  c.ev("render()"); assert.doesNotMatch(c.q("#main").textContent, /无锁敏感正文/);
  c.hidden(false); c.ev("render()");
  assert.doesNotMatch(c.q("#main").textContent, /无锁敏感正文/);
  const reveal = [...c.q("#main").querySelectorAll("button")].find(b => /打开|继续/.test(b.textContent));
  assert.ok(reveal); reveal.click();
  assert.match(c.q("#main").textContent, /无锁敏感正文/);
});

test("离开日记视图会隐藏失败写作面板并保留草稿", c => {
  const restore = c.fault("all"); open(c); const ta = c.type("离开视图前的秘密");
  c.q('#tabs [data-view="today"]').click();
  assert.equal(c.ev("VIEW"), "today"); assert.equal(c.q(".sheet"), null);
  assert.equal(ta.value, ""); assert.equal(c.drafts()[0].draft.text, "离开视图前的秘密");
  assert.doesNotMatch(c.d.body.textContent, /离开视图前的秘密/);
  restore(); c.q('#tabs [data-view="diary"]').click(); open(c);
  assert.equal(c.q("#dyText").value, "离开视图前的秘密");
  c.q("#dyDone").click(); assert.equal(c.stored().entries[today(c)].text, "离开视图前的秘密");
});

test("阅读页与设置密码页的敏感 DOM 在后台被清除", c => {
  c.ev('showDiaryEntry("2026-01-01")');
  const sheet = c.q(".sheet"), page = c.q(".dy-page-t");
  background(c); assert.equal(c.q(".sheet"), null);
  assert.equal(sheet.textContent, ""); assert.equal(page.textContent, "");
  c.hidden(false); assert.equal(c.ev("diaryUnlock()"), true); c.ev("openDiaryLock()");
  const pin = c.q("#dyL1"); pin.value = "2580";
  background(c); assert.equal(c.q(".sheet"), null); assert.equal(pin.value, "");
});

test("pagehide 隐藏无锁正文且未提交字保存在内存", c => {
  const restore = c.fault("all"); open(c); const ta = c.type("页面离开秘密");
  c.w.dispatchEvent(new c.w.Event("pagehide"));
  assert.equal(c.q(".sheet"), null); assert.equal(ta.value, "");
  assert.doesNotMatch(c.q("#main").textContent, /已保存正文|页面离开秘密/);
  assert.equal(c.drafts()[0].draft.text, "页面离开秘密"); restore();
});

test("beforeunload 保存失败时请求阻止离开且不移除草稿面板", c => {
  const restore = c.fault("all"); open(c); c.type("离开提示草稿");
  const e = new c.w.Event("beforeunload", { cancelable: true }); c.w.dispatchEvent(e);
  assert.equal(e.defaultPrevented, true); assert.ok(c.q("#dyText"));
  assert.equal(c.drafts()[0].draft.text, "离开提示草稿"); restore();
});

test("本地兜底草稿可在新页面恢复", c => {
  const restore = c.fault("diary"); open(c); c.type("重载也要找回"); background(c);
  const dump = c.dump(); restore();
  const next = make(undefined, dump);
  try { open(next); assert.equal(next.q("#dyText").value, "重载也要找回"); next.q("#dyDone").click(); assert.equal(next.stored().entries[today(next)].text, "重载也要找回"); assert.equal(next.drafts().length, 0); }
  finally { next.close(); }
});

test("旧 DY 的保存 CAS 不覆盖其他窗口的新存档", c => {
  const latest = book("另一个窗口的新正文"); latest.entries["2026-01-02"] = entry("新增日记");
  c.w.localStorage.setItem(KEY, JSON.stringify(latest));
  c.ev('DY.entries["2026-01-01"].text="旧窗口的旧编辑"');
  assert.equal(c.ev("diarySave()"), false);
  assert.deepEqual(c.stored(), latest);
  assert.equal(c.ev('DY.entries["2026-01-01"].text'), "已保存正文");
});

test("跨窗口不同日期冲突可显式重读后重试且保留双方记录", c => {
  originalToday(c); open(c); c.type("本窗口今天的草稿");
  const latest = c.stored(); latest.entries["2026-01-02"] = entry("另一个窗口的新日记");
  c.w.localStorage.setItem(KEY, JSON.stringify(latest));
  c.q("#dyDone").click(); assert.ok(c.q(".sheet")); assert.deepEqual(c.stored(), latest);
  c.q("#dyReload").click(); c.q("#dyDone").click();
  assert.equal(c.q(".sheet"), null);
  assert.equal(c.stored().entries["2026-01-02"].text, "另一个窗口的新日记");
  assert.equal(c.stored().entries[today(c)].text, "本窗口今天的草稿");
});

test("跨窗口同日冲突不能靠重开面板绕过草稿基线", c => {
  originalToday(c); open(c); c.type("旧的失败草稿");
  const latest = c.stored(); latest.entries[today(c)] = entry("另一个窗口更新的今天");
  c.w.localStorage.setItem(KEY, JSON.stringify(latest));
  c.q("#dyDone").click(); c.q("#dyReload").click();
  assert.deepEqual(c.stored(), latest);
  background(c); c.hidden(false); open(c);
  assert.equal(c.q("#dyText").value, "旧的失败草稿"); c.q("#dyDone").click();
  assert.ok(c.q(".sheet")); assert.deepEqual(c.stored(), latest);
  assert.equal(c.drafts()[0].draft.text, "旧的失败草稿");
});

test("导出始终读取最新日记而不是过期 DY", c => {
  const latest = book("最新可导出正文"); latest.entries["2026-01-02"] = entry("新窗口记录");
  c.w.localStorage.setItem(KEY, JSON.stringify(latest));
  assert.deepEqual(JSON.parse(c.ev("JSON.stringify(diaryExport())")), latest);
});

for (const mode of ["read", "corrupt", "array", "empty"]) {
  test("导出遇到" + mode + "故障必须抛错，不能伪装成无日记", c => {
    const before = c.snapshot();
    const restore = mode === "read" ? c.fault("read") : () => {};
    if (mode !== "read") c.w.localStorage.setItem(KEY, mode === "corrupt" ? "{损坏" : mode === "array" ? "[]" : "");
    assert.throws(() => c.ev("diaryExport()"));
    assert.equal(c.snapshot(), before); restore();
  });
}

test("导出不能跳过仍失败的写作草稿", c => {
  const restore = c.fault("diary"); open(c); c.type("导出前未落盘的草稿");
  assert.throws(() => c.ev("diaryExport()"));
  assert.equal(c.drafts()[0].draft.text, "导出前未落盘的草稿"); assert.ok(c.q(".sheet")); restore();
});

test("导入写失败必须抛错并回滚所有日记内存、锁与元数据", c => {
  const before = c.snapshot(), raw = c.raw();
  const restore = c.fault("diary");
  const incoming = book(); incoming.entries["2026-01-02"] = entry("不应半成功的导入"); incoming.lock = { salt: "s", h: "h" }; incoming.intro = true;
  assert.throws(() => c.ev(`diaryMergeImport(${JSON.stringify(incoming)})`));
  assert.equal(c.raw(), raw); assert.equal(c.snapshot(), before);
  restore(); assert.equal(c.ev(`diaryMergeImport(${JSON.stringify(incoming)})`), 1);
  assert.equal(c.stored().entries["2026-01-02"].text, "不应半成功的导入");
});

test("导入读失败不能把缓存当成最新存档，失败状态完全不变", c => {
  const before = c.snapshot(), restore = c.fault("read");
  assert.throws(() => c.ev(`diaryMergeImport(${JSON.stringify(book())})`));
  assert.equal(c.snapshot(), before); restore();
});

test("日记原文损坏时导入抛错，保留原文与缓存", c => {
  const before = c.snapshot(); c.w.localStorage.setItem(KEY, "{损坏原文");
  assert.throws(() => c.ev(`diaryMergeImport(${JSON.stringify(book())})`));
  assert.equal(c.raw(), "{损坏原文"); assert.equal(c.snapshot(), before);
});

test("导入以最新日记只补不删，保留新窗口内容和本地锁", c => {
  const latest = book("最新手机正文"); latest.lock = { salt: "local", h: "local-h" }; latest.entries["2026-01-02"] = entry("最新新增");
  c.w.localStorage.setItem(KEY, JSON.stringify(latest));
  const incoming = book("旧备份正文"); incoming.lock = { salt: "backup", h: "backup-h" }; incoming.entries["2026-01-03"] = entry("只补这一天");
  assert.equal(c.ev(`diaryMergeImport(${JSON.stringify(incoming)})`), 1);
  assert.equal(c.stored().entries["2026-01-01"].text, "最新手机正文");
  assert.equal(c.stored().entries["2026-01-02"].text, "最新新增");
  assert.equal(c.stored().entries["2026-01-03"].text, "只补这一天");
  assert.deepEqual(c.stored().lock, latest.lock);
  const saved = c.raw(); assert.equal(c.ev(`diaryMergeImport(${JSON.stringify(incoming)})`), 0); assert.equal(c.raw(), saved);
});

test("导入 CAS 检测读取后出现的新存档，抛错且不修改内存", c => {
  const before = c.snapshot(), latest = JSON.stringify(book("CAS 窗口最新存档"));
  const p = c.w.Storage.prototype, get = p.getItem, set = p.setItem;
  let reads = 0;
  p.getItem = function(k) {
    if (k === KEY && ++reads === 2) set.call(this, KEY, latest);
    return get.call(this, k);
  };
  const incoming = book(); incoming.entries["2026-01-02"] = entry("不能覆盖并发结果");
  try { assert.throws(() => c.ev(`diaryMergeImport(${JSON.stringify(incoming)})`)); assert.equal(c.snapshot(), before); assert.equal(c.raw(), latest); }
  finally { p.getItem = get; }
});

test("未加载日记时导入写失败也不能留下半初始化状态", c => {
  c.ev('DY=null; DY_LAST_RAW=null; DY_SAVED=null; DY_ERROR=""; DY_OPEN=false;');
  const before = c.snapshot(), raw = c.raw(), restore = c.fault("diary");
  const incoming = book(); incoming.entries["2026-01-02"] = entry("未初始化事务");
  assert.throws(() => c.ev(`diaryMergeImport(${JSON.stringify(incoming)})`));
  assert.equal(c.snapshot(), before); assert.equal(c.raw(), raw); restore();
});

test("保存读取故障回滚内存而不覆盖磁盘正文", c => {
  const raw = c.raw(), restore = c.fault("read");
  c.ev('DY.entries["2026-01-01"].text="读失败不能提交"');
  assert.equal(c.ev("diarySave()"), false);
  assert.equal(c.ev('DY.entries["2026-01-01"].text'), "已保存正文");
  restore(); assert.equal(c.raw(), raw);
});

test("其他窗口换锁后旧密码失效，失败草稿经新锁验证后仍可保存", c => {
  originalToday(c); assert.equal(c.ev('diarySetLock("2580","2580")'), true);
  open(c); c.type("换锁前未存的字");
  const latest = c.stored(); latest.lock = { salt: "new-lock", h: c.ev('pinHash("1357","new-lock")') };
  c.w.localStorage.setItem(KEY, JSON.stringify(latest));
  c.q("#dyDone").click(); assert.ok(c.q(".sheet")); assert.deepEqual(c.stored(), latest);
  background(c); c.hidden(false);
  assert.equal(c.ev('diaryUnlock("2580")'), false);
  assert.doesNotMatch(c.q("#main").textContent, /旧的今天|换锁前未存的字/);
  assert.equal(c.ev('diaryUnlock("1357")'), true);
  open(c); assert.equal(c.q("#dyText").value, "换锁前未存的字");
  c.q("#dyDone").click();
  assert.equal(c.stored().entries[today(c)].text, "换锁前未存的字");
  assert.deepEqual(c.stored().lock, latest.lock);
});

test("后台留下的失败草稿也不能被导出静默遗漏", c => {
  const restore = c.fault("diary"); open(c); c.type("后台兜底但未提交"); background(c); restore();
  assert.throws(() => c.ev("diaryExport()"));
  assert.equal(c.drafts()[0].draft.text, "后台兜底但未提交");
  c.hidden(false); open(c); c.q("#dyDone").click();
  assert.equal(JSON.parse(c.ev("JSON.stringify(diaryExport())")).entries[today(c)].text, "后台兜底但未提交");
});

test("导入失败不改变活动写作框、重试钩子和已有草稿", c => {
  assert.equal(c.ev('diarySetLock("2580","2580")'), true); open(c); c.type("导入前的活动草稿");
  const state = c.snapshot(), drafts = c.drafts(), flush = c.ev("DY_FLUSH"), hide = c.ev("DY_HIDE"), ta = c.q("#dyText");
  const incoming = book(); incoming.entries["2026-01-02"] = entry("失败导入");
  const restore = c.fault("diary");
  assert.throws(() => c.ev(`diaryMergeImport(${JSON.stringify(incoming)})`));
  assert.equal(c.snapshot(), state); assert.deepEqual(c.drafts(), drafts);
  assert.equal(c.ev("DY_FLUSH"), flush); assert.equal(c.ev("DY_HIDE"), hide);
  assert.equal(c.q("#dyText"), ta); assert.equal(ta.value, "导入前的活动草稿"); restore();
  c.q("#dyDone").click(); assert.equal(c.stored().entries[today(c)].text, "导入前的活动草稿");
});

test("导入非法容器抛错，缺省日记按公共契约返回零且不写入", c => {
  const state = c.snapshot(), raw = c.raw();
  for (const value of ['[]', '"坏数据"', 'false', '0']) assert.throws(() => c.ev(`diaryMergeImport(${value})`));
  assert.equal(c.ev("diaryMergeImport(null)"), 0); assert.equal(c.ev("diaryMergeImport(undefined)"), 0);
  assert.equal(c.snapshot(), state); assert.equal(c.raw(), raw);
});

test("导出未加载且读取失败时不留下默认空日记缓存", c => {
  c.ev('DY=null; DY_LAST_RAW=null; DY_SAVED=null; DY_ERROR=""; DY_OPEN=false;');
  const state = c.snapshot(), restore = c.fault("read");
  assert.throws(() => c.ev("diaryExport()")); assert.equal(c.snapshot(), state); restore();
});

(async () => {
  for (const { name, action } of cases) {
    const c = make(book());
    try { await action(c); assert.deepEqual(c.errors, [], "不能忽略运行期脚本异常"); pass++; console.log("通过 " + name); }
    catch (e) { fail++; console.error("失败 " + name + "\n" + e.stack); }
    finally { c.close(); }
  }
  console.log(`日记可靠性故障测试：${pass} 通过 / ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
})();
