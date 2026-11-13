/* 主存档故障回归：仅使用合成数据和隔离存储，不读取个人备份。 */
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync(path.join(__dirname, "..", "..", "少年主公.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)[1].replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/, "");
const MAIN = "shaozhu_v1", DIARY = "shaozhu_diary", TX = MAIN + "_import_tx";
const cases = [], test = (name, action) => cases.push({ name, action });
let pass = 0, fail = 0;
function make(seed = {}) {
  const errors = [], messages = [], alerts = [], vc = new VirtualConsole();
  vc.on("jsdomError", e => { if (!/Not implemented|Could not parse CSS|getContext/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html.replace(/<script>[\s\S]*<\/script>/, ""), { runScripts: "outside-only", url: "http://localhost/", virtualConsole: vc });
  const w = dom.window;
  w.scrollTo = () => {}; w.confirm = () => true; w.alert = s => alerts.push(s);
  w.setTimeout = () => 1; w.clearTimeout = () => {};
  w.URL.createObjectURL = () => "blob:test"; w.URL.revokeObjectURL = () => {};
  for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, v);
  vm.runInContext(script, dom.getInternalVMContext());
  const ev = code => w.eval(code), q = s => w.document.querySelector(s);
  w.__messages = messages;
  ev('toast=(message)=>window.__messages.push(message); ST=load(); if(!ST&&!LOAD_ERROR){ ST=defaultState(); save(); } PARENT_UNTIL=1e15;');
  const c = {
    w, ev, q, errors, messages, alerts,
    raw: key => w.localStorage.getItem(key || MAIN),
    json: code => JSON.parse(ev("JSON.stringify(" + code + ")")),
    snap: () => ev("JSON.stringify({ST,STATE_SAVED,STORAGE_LAST_RAW,LOAD_ERROR})"),
    fault(action) {
      const p = w.Storage.prototype, set = p.setItem, get = p.getItem, remove = p.removeItem;
      p.setItem = function(k, v) { action("set", k, v); return set.call(this, k, v); };
      p.getItem = function(k) { action("get", k); return get.call(this, k); };
      p.removeItem = function(k) { action("remove", k); return remove.call(this, k); };
      return () => { p.setItem = set; p.getItem = get; p.removeItem = remove; };
    },
    import(data) {
      w.FileReader = class { readAsText() { this.result = JSON.stringify(data); this.onload(); } };
      w.__input = { files: [{}], value: "synthetic.json" };
      ev("importData(window.__input)");
    },
    close: () => w.close()
  };
  return c;
}
function one(c, days = 7) {
  c.ev(`ST=defaultState(); ST.tasks=[{id:"a",name:"A",emoji:"",subject:"cn",type:"daily",planMin:10,weekTarget:7,weekdays:[0,1,2,3,4,5,6],timeSlot:"any",boss:false,archived:false}]; ST.createdAt=addD(TODAY(),-${days - 1}); for(let i=0;i<${days};i++) setRec(addD(TODAY(),-i),"a",1,"full",10); if(!save()) throw new Error("夹具保存失败");`);
}
function pack(c, extra = false) {
  const d = c.json("packParse(packBuild()).data");
  if (extra) d.tasks.push({ name: "B", emoji: "", subject: "math", type: "daily", planMin: 15, weekTarget: 7, weekdays: [0,1,2,3,4,5,6], timeSlot: "any", boss: false });
  return d;
}
function apply(c, d) { return c.ev("packApply(" + JSON.stringify(d) + ")"); }
function book(text = "合成旧日记", date = "2026-01-01") {
  return { v: 1, intro: true, lock: null, entries: { [date]: { text, face: "", weather: "", colors: {}, at: 1, upd: 1 } }, promptDay: {}, nudged: "" };
}
function importFixture(c) {
  c.w.localStorage.setItem(DIARY, JSON.stringify(book())); c.ev("diaryLoad()");
  const data = c.json("ST"); data.childName = "导入测试名字"; data.diary = book("合成补回日记", "2026-01-02");
  return data;
}
function forge(c, body) {
  c.w.__body = JSON.stringify(body);
  return c.ev('PACK_PREFIX+packEnc(window.__body)+"."+packSig(window.__body)');
}
function wire(at) {
  return { at, tasks: [{ n: "A", e: "", s: "cn", y: "daily", m: 10, w: 7, d: [1], o: "any", b: 0 }], prizes: [] };
}

test("普通对象识别兼容不同 VM realm，拒绝自定义实例与伪造原型", c => {
  const sb = { Object, JSON };
  vm.createContext(sb);
  vm.runInContext(c.ev("stateObject.toString()"), sb);
  assert.equal(vm.runInContext("stateObject({nested:{}})", sb), true);
  assert.equal(vm.runInContext('stateObject(JSON.parse("{}"))', sb), true);
  assert.equal(vm.runInContext("stateObject(Object.create(null))", sb), true);
  for (const expr of ["[]", "new Date()", "new (class Foo {})()", "Object.create({})", "Object.create(Object.assign(Object.create(null),{constructor:Object}))"]) {
    assert.equal(vm.runInContext("stateObject(" + expr + ")", sb), false, expr);
  }
  c.w.__foreign = vm.runInNewContext("({tasks:[],records:{},breaks:[]})");
  assert.equal(c.ev("!!prepareState(window.__foreign)"), true);
  assert.equal(c.ev("save(); !!load()"), true);
});

test("records 数组与 breaks 对象必须拒绝，原档保留且禁止覆盖", c => {
  const valid = c.json("ST");
  for (const [k, v] of [["records", []], ["breaks", {}]]) {
    const bad = { ...valid, [k]: v }, raw = JSON.stringify(bad);
    assert.throws(() => c.ev("prepareState(" + raw + ")"));
    c.w.localStorage.setItem(MAIN, raw);
    assert.equal(c.ev("load()"), null);
    assert.equal(c.ev("save()"), false);
    assert.equal(c.raw(), raw);
  }
});

test("单张坏锦囊不拖垮旧档，缺 tier 降级 common，保留异常门槛标记", c => {
  const data = c.json("ST"); delete data.schema;
  data.vault = [{ uid: "old", name: "旧锦囊", merit: "不是数字", redeemed: false, gotAt: "2026-01-01" }];
  c.w.localStorage.setItem(MAIN, JSON.stringify(data));
  assert.equal(c.ev("ST=load(); !!ST"), true);
  assert.equal(c.ev('ST.vault[0].tier'), "common");
  assert.equal(c.ev('ST.vault[0].merit'), 0);
  assert.equal(c.ev('ST.vault[0].meritInvalid'), "不是数字");
  assert.equal(c.ev("save()"), true);
});

test("金额、次数及活任务数字校验仍严格拒绝异常", c => {
  for (const change of ['s.bonusMerit=-1', 's.peakMerit="坏数"', 's.draws=1.5', 's.tasks[0].planMin=0', 's.tasks[0].weekTarget=Infinity', 's.records[TODAY()]={a:{level:1,type:"full",minutes:-1}}']) {
    assert.throws(() => c.ev("(()=>{const s=defaultState();" + change + ";return prepareState(s)})()"), change);
  }
});

test("旧账本缺省分钟的零值可加载，但负值不可接受", c => {
  one(c);
  c.ev("ST.tasks[0].planMin=undefined; settleLedger();");
  assert.equal(c.ev("save(); ST=load(); !!ST"), true);
  assert.equal(c.ev("Object.values(ST.ledger)[0].tasks[0].planMin"), 0);
  assert.throws(() => c.ev("(()=>{const s=JSON.parse(JSON.stringify(ST));Object.values(s.ledger)[0].tasks[0].planMin=-1;return prepareState(s)})()"));
});

test("七天一任务完胜，改包新增 B 后仍为 28.2／当天 6／令 7，补录用旧规则", c => {
  one(c);
  assert.equal(c.ev("earnedMerit()"), 28.2);
  const d = pack(c, true);
  assert.equal(apply(c, d), true);
  assert.equal(c.ev("earnedMerit()"), 28.2);
  assert.equal(c.ev("dayMerit(TODAY())"), 6);
  assert.equal(c.ev("ticketsEarned()"), 7);
  assert.equal(c.ev("tasksForDate(TODAY()).length"), 1);
  assert.equal(c.ev("tasksForDate(addD(TODAY(),1)).length"), 2);
  c.ev('setRec(addD(TODAY(),-1),"a",null,null,0);setRec(addD(TODAY(),-1),"a",1,"full",10);');
  assert.equal(c.ev("earnedMerit()"), 28.2);
  assert.equal(c.ev("ticketsEarned()"), 7);
  assert.equal(c.ev("tasksForDate(addD(TODAY(),-1)).length"), 1);
  assert.equal(c.ev("save(); ST=load(); earnedMerit()"), 28.2);
});

test("任务编辑与删除明天生效，只归档，原记录与补录窗口不丢失", c => {
  one(c);
  c.ev('openTaskEdit("a")'); c.q("#tMin").value = "25"; c.q("#tOk").click();
  assert.equal(c.ev('ST.tasks[0].planMin'), 25);
  assert.equal(c.ev('tasksForDate(TODAY())[0].planMin'), 10);
  assert.equal(c.ev('tasksForDate(addD(TODAY(),1))[0].planMin'), 25);
  const records = c.ev("JSON.stringify(ST.records)");
  c.ev('delTask("a")');
  assert.equal(c.ev("JSON.stringify(ST.records)"), records);
  assert.equal(c.ev('ST.tasks[0].archived'), true);
  assert.equal(c.ev('tasksForDate(TODAY()).length'), 1);
  assert.equal(c.ev('tasksForDate(addD(TODAY(),1)).length'), 0);
  assert.equal(c.ev('earnedMerit()'), 28.2);
  assert.equal(c.ev('ticketsEarned()'), 7);
});

for (const mode of ["配额", "并发"]) test("packApply " + mode + "失败返回 null，完整回滚结算／规则／留痕／去重状态", c => {
  one(c);
  const d = pack(c, true), before = c.snap(), raw = c.raw();
  let restore = () => {};
  if (mode === "配额") restore = c.fault((op, k) => { if (op === "set" && k === MAIN) throw new Error("QuotaExceededError"); });
  else c.w.localStorage.setItem(MAIN, JSON.stringify({ ...c.json("ST"), childName: "另一窗口" }));
  assert.equal(apply(c, d), null);
  restore();
  assert.equal(c.snap(), before);
  if (mode === "配额") assert.equal(c.raw(), raw);
  else assert.equal(JSON.parse(c.raw()).childName, "另一窗口");
  assert.ok(c.messages.some(s => /没有保存/.test(s)));
});

test("内容去重不依赖时间，同毫秒不同内容可导，换时间的相同内容仍拒绝", c => {
  one(c, 1);
  const a = pack(c), b = structuredClone(a); b.tasks[0].planMin = 20;
  assert.equal(apply(c, a), true);
  assert.equal(apply(c, b), true);
  const before = c.snap(), dup = structuredClone(b); dup.at += 1;
  assert.equal(apply(c, dup), null);
  assert.equal(c.snap(), before);
  assert.equal(c.ev("ST.packHistory.length"), 2);
});

test("设置包时间必须为正有限安全整数，过远未来拒绝，有限时钟偏差兼容", c => {
  const now = c.w.Date.now();
  c.w.Date.now = () => now;
  for (const at of [-1, 0, 1.5, "123", null, Number.MAX_SAFE_INTEGER + 1, now + 86400001]) {
    const code = forge(c, wire(at));
    assert.equal(c.ev("packParse(" + JSON.stringify(code) + ").ok"), false, String(at));
  }
  assert.equal(c.ev("packParse(" + JSON.stringify(forge(c, wire(now + 9e6))) + ").ok"), true);
});

for (const kind of ["tasks", "prizes"]) test("本机" + kind + "重名必须整包拒绝，不猜匹配对象", c => {
  one(c, 1); const d = pack(c);
  c.ev('ST.' + kind + '.push(Object.assign({},ST.' + kind + '[0],{id:"duplicate"}));save();');
  const before = c.snap();
  assert.equal(apply(c, d), null);
  assert.equal(c.snap(), before);
  assert.ok(c.messages.some(s => /重名/.test(s)));
});

test("设置包不能自动复活归档任务，也不能替待批准任务转正", c => {
  for (const flag of ["archived", "pending"]) {
    one(c, 1); const d = pack(c); c.ev('ST.tasks[0].' + flag + '=true; save();');
    const before = c.snap();
    assert.equal(apply(c, d), null);
    assert.equal(c.snap(), before);
  }
});

for (const kind of ["任务", "锦囊", "设置包"]) test(kind + "确认提交时重新检查家长解锁状态", c => {
  one(c, 1); c.ev("ST.parentPin=familyPin();save();");
  let submit;
  if (kind === "任务") { c.ev('openTaskEdit("a")'); c.q("#tMin").value = "28"; submit = c.q("#tOk"); }
  else if (kind === "锦囊") { c.ev('openPrizeEdit(ST.prizes[0].id)'); c.q("#pCost").value = "88"; submit = c.q("#pOk"); }
  else { c.ev("openPackConfirm(" + JSON.stringify(pack(c, true)) + ")"); submit = c.q("#pkGo"); }
  const before = c.ev("JSON.stringify(ST)"); c.ev("lockParent()"); submit.click();
  assert.ok(c.q("#pinIn"));
  assert.equal(c.ev("JSON.stringify(ST)"), before);
});

for (const kind of ["基本设置", "锦囊保存", "锦囊删除"]) test(kind + "写入失败不得报成功，内存与持久数据完整回滚", c => {
  one(c, 1);
  let submit;
  if (kind === "基本设置") { c.ev('VIEW="settings";render()'); c.q("#sChild").value = "不能保存的名字"; submit = () => c.ev("saveBasic()"); }
  else if (kind === "锦囊保存") { c.ev('openPrizeEdit(ST.prizes[0].id)'); c.q("#pCost").value = "66"; submit = () => c.q("#pOk").click(); }
  else submit = () => c.ev("delPrize(ST.prizes[0].id)");
  const before = c.snap(), raw = c.raw(); c.messages.length = 0;
  const restore = c.fault((op, k) => { if (op === "set" && k === MAIN) throw new Error("QuotaExceededError"); });
  submit(); restore();
  assert.equal(c.snap(), before); assert.equal(c.raw(), raw);
  assert.ok(c.messages.some(s => /没有保存/.test(s)));
  assert.ok(!c.messages.some(s => /已保存|已删除|已入榜/.test(s)));
});

for (const target of [MAIN + "_before_import", TX, MAIN, DIARY]) test("主导入在 " + target + " 写入失败不能半成功，原两键和内存保持不变", c => {
  const data = importFixture(c), before = c.snap(), main = c.raw(), diary = c.raw(DIARY), dy = c.ev("JSON.stringify({DY,DY_LAST_RAW,DY_SAVED,DY_OPEN,DY_ERROR})");
  c.messages.length = 0;
  const restore = c.fault((op, k) => { if (op === "set" && k === target) throw new Error("QuotaExceededError"); });
  c.import(data); restore();
  assert.equal(c.raw(), main); assert.equal(c.raw(DIARY), diary); assert.equal(c.raw(TX), null);
  assert.equal(c.snap(), before); assert.equal(c.ev("JSON.stringify({DY,DY_LAST_RAW,DY_SAVED,DY_OPEN,DY_ERROR})"), dy);
  assert.ok(c.alerts.some(s => /导入失败/.test(s)));
  assert.ok(!c.messages.some(s => /导入成功/.test(s)));
});

test("主档与日记先预演再写持久事务凭据，导入成功后两键和 DY 一致", c => {
  const data = importFixture(c), operations = [];
  const restore = c.fault((op, k) => { if (op === "set") operations.push(k); });
  c.import(data); restore();
  assert.ok(operations.indexOf(TX) < operations.indexOf(MAIN));
  assert.ok(operations.indexOf(TX) < operations.indexOf(DIARY));
  assert.equal(c.raw(TX), null);
  assert.equal(JSON.parse(c.raw()).childName, data.childName);
  assert.equal(c.ev("ST.childName"), data.childName);
  assert.equal(c.ev('DY.entries["2026-01-01"].text'), "合成旧日记");
  assert.equal(c.ev('DY.entries["2026-01-02"].text'), "合成补回日记");
  assert.equal(c.ev("DY_LAST_RAW"), c.raw(DIARY));
  assert.ok(c.messages.some(s => /导入成功/.test(s)));
  assert.equal(c.alerts.length, 0);
});

test("无效主档或日记在任何事务写入之前拒绝", c => {
  for (const field of ["records", "diary"]) {
    const data = importFixture(c); data[field] = [];
    const main = c.raw(), diary = c.raw(DIARY), writes = [];
    const restore = c.fault((op, k) => { if (op === "set") writes.push(k); });
    c.import(data); restore();
    assert.equal(c.raw(), main); assert.equal(c.raw(DIARY), diary);
    assert.deepEqual(writes, []);
  }
});

test("日记读取失败阻止整个主导入，主档不先落盘", c => {
  const data = importFixture(c), main = c.raw();
  const restore = c.fault((op, k) => { if (op === "get" && k === DIARY) throw new Error("日记读取失败"); });
  c.import(data); restore();
  assert.equal(c.raw(), main); assert.equal(c.raw(TX), null);
  assert.ok(!c.messages.some(s => /导入成功/.test(s)));
});

test("主导入并发主档变更必须拒绝，不能覆盖另一窗口", c => {
  const data = importFixture(c), other = JSON.stringify({ ...c.json("ST"), childName: "另一窗口最新" });
  c.w.localStorage.setItem(MAIN, other);
  c.import(data);
  assert.equal(c.raw(), other); assert.equal(c.raw(TX), null);
  assert.ok(c.alerts.some(s => /另一窗口/.test(s)));
});

test("日记导入以最新持久数据为准，保留另一窗口已写入的内容", c => {
  const data = importFixture(c), latest = book("另一窗口内容", "2026-01-03");
  c.w.localStorage.setItem(DIARY, JSON.stringify(latest));
  c.import(data);
  assert.equal(c.ev('DY.entries["2026-01-03"].text'), "另一窗口内容");
  assert.equal(c.ev('DY.entries["2026-01-02"].text'), "合成补回日记");
  assert.equal(c.alerts.length, 0);
});

test("日记失败且主档回滚也失败时保留持久凭据并停写，重载可恢复两键", c => {
  const data = importFixture(c), main = c.raw(), diary = c.raw(DIARY);
  let mainWrites = 0;
  const restore = c.fault((op, k) => {
    if (op === "set" && k === MAIN && ++mainWrites > 1) throw new Error("主档回滚故障");
    if (op === "set" && k === DIARY) throw new Error("日记写入故障");
  });
  c.import(data);
  assert.notEqual(c.raw(TX), null);
  assert.equal(c.ev("save()"), false);
  assert.ok(c.ev("LOAD_ERROR"));
  restore();
  assert.equal(c.ev("ST=load(); !!ST"), true);
  assert.equal(c.raw(), main); assert.equal(c.raw(DIARY), diary); assert.equal(c.raw(TX), null);
  assert.equal(c.ev("ST.childName"), JSON.parse(main).childName);
});

for (const stage of ["仅凭据", "已写主档", "两键已写"]) test("模拟导入中断：" + stage + "，新页面加载自动完整恢复", c => {
  const beforeMain = c.raw(), beforeDiary = JSON.stringify(book()), next = c.json("ST"); next.childName = "未完成导入";
  const afterMain = JSON.stringify(next), afterDiary = JSON.stringify(book("未完成补入", "2026-01-02"));
  const seed = { [MAIN]: stage === "仅凭据" ? beforeMain : afterMain, [DIARY]: stage === "两键已写" ? afterDiary : beforeDiary, [TX]: JSON.stringify({ v:1, beforeMain, afterMain, beforeDiary, afterDiary }) };
  const reload = make(seed);
  try { assert.equal(reload.raw(), beforeMain); assert.equal(reload.raw(DIARY), beforeDiary); assert.equal(reload.raw(TX), null); assert.equal(reload.ev("LOAD_ERROR"), ""); }
  finally { reload.close(); }
});

test("事务中断后发现另一窗口不同数据，保留凭据与最新内容，停止恢复覆盖", c => {
  const beforeMain = c.raw(), other = JSON.stringify({ ...c.json("ST"), childName: "必须保留" });
  const tx = JSON.stringify({ v:1, beforeMain, afterMain: beforeMain + " ", beforeDiary:null, afterDiary:null });
  const reload = make({ [MAIN]: other, [TX]: tx });
  try { assert.equal(reload.raw(), other); assert.equal(reload.raw(TX), tx); assert.ok(reload.ev("LOAD_ERROR")); assert.equal(reload.ev("save()"), false); }
  finally { reload.close(); }
});

test("事务完成凭据删除失败也必须回滚，不能虚报导入成功", c => {
  const data = importFixture(c), main = c.raw(), diary = c.raw(DIARY);
  let once = false;
  const restore = c.fault((op, k) => { if (op === "remove" && k === TX && !once) { once = true; throw new Error("事务提交失败"); } });
  c.import(data); restore();
  assert.equal(c.raw(), main); assert.equal(c.raw(DIARY), diary); assert.equal(c.raw(TX), null);
  assert.ok(!c.messages.some(s => /导入成功/.test(s)));
});

test("主导入异步读完文件后家长已锁定，必须重新验证且不能先写入", c => {
  const data = importFixture(c);
  c.ev("ST.parentPin=familyPin();save();");
  const before = c.raw(), diary = c.raw(DIARY);
  let reader;
  c.w.FileReader = class { readAsText() { reader = this; } };
  c.w.__input = { files: [{}], value: "synthetic.json" };
  c.ev("importData(window.__input);lockParent()");
  reader.result = JSON.stringify(data); reader.onload();
  assert.ok(c.q("#pinIn")); assert.equal(c.raw(), before); assert.equal(c.raw(DIARY), diary); assert.equal(c.raw(TX), null);
});

test("主导入没有日记字段时日记原文保持不变", c => {
  const data = importFixture(c), diary = c.raw(DIARY); delete data.diary;
  c.import(data);
  assert.equal(c.raw(DIARY), diary); assert.equal(c.raw(TX), null);
  assert.equal(c.ev("ST.childName"), data.childName);
  assert.ok(c.messages.some(s => /导入成功/.test(s)));
});

test("主导出成功带上最新日记，记日期写入失败不得报已导出成功", c => {
  c.w.localStorage.setItem(DIARY, JSON.stringify(book()));
  c.w.__downloaded = [];
  c.ev('downloadBackup=(json)=>{window.__downloaded.push(json);return true};');
  const before = c.raw(), restore = c.fault((op, k) => { if(op === "set" && k === MAIN) throw new Error("主档写入故障"); });
  c.ev("exportData()"); restore();
  assert.equal(c.w.__downloaded.length, 1);
  assert.equal(JSON.parse(c.w.__downloaded[0]).diary.entries["2026-01-01"].text, "合成旧日记");
  assert.equal(c.raw(), before);
  assert.ok(!c.messages.some(s => /已导出|已分享/.test(s)));
});

test("主导出遇到 diaryExport 异常必须明确阻止下载与成功提示", c => {
  c.w.__downloaded = 0;
  c.ev('downloadBackup=()=>{window.__downloaded++;return true};diaryExport=()=>{throw new Error("合成日记导出故障")};');
  const before = c.snap();
  assert.equal(c.ev("exportData()"), false);
  assert.equal(c.w.__downloaded, 0); assert.equal(c.snap(), before);
  assert.ok(c.messages.some(s => /备份未导出.*日记导出故障/.test(s)));
});

for (const { name, action } of cases) {
  const c = make();
  try { action(c); assert.deepEqual(c.errors, []); pass++; console.log("通过 " + name); }
  catch (e) { fail++; console.error("失败 " + name + "\n" + e.stack); }
  finally { c.close(); }
}
console.log(`\n主存档可靠性：${pass} 通过 / ${fail} 失败`);
process.exitCode = fail ? 1 : 0;
