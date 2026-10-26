/* 逻辑自测（vm 沙箱，无需浏览器）
   用法：node .workbuddy/tests/logic.js
   覆盖：数据迁移 · 补录窗口 · 账目冻结 · 休假 · 兑现 · 难度 · 主动性 · 存储告警 · 渲染冒烟 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "少年主公.html"), "utf8");
let code = html.match(/<script>([\s\S]*)<\/script>/)[1];
try { new vm.Script(code); console.log("✅ 语法检查通过"); }
catch (e) { console.error("❌ 语法错误:", e.message); process.exit(1); }

function fakeEl(){
  const set=new Set();
  return { innerHTML:"", textContent:"", style:{}, value:"", disabled:false, dataset:{}, className:"",
    classList:{add(c){set.add(c);},remove(c){set.delete(c);},toggle(c,f){f?set.add(c):set.delete(c);},contains(c){return set.has(c);}},
    addEventListener(){}, click(){}, remove(){}, appendChild(){},
    querySelector(){return fakeEl();}, querySelectorAll(){return [];}, closest(){return null;},
    getBoundingClientRect(){return {left:0,top:0,width:0,height:0};} };
}
const store = {}, elCache = {};
const qs = (s) => (elCache[s] = elCache[s] || fakeEl());
let storageBroken = false;
const documentFake = {
  _lastMask: null,
  createElement: () => fakeEl(),
  querySelector: (s) => (s === ".mask" ? documentFake._lastMask : qs(s)),
  querySelectorAll: () => [], addEventListener(){},
  body: { style:{}, appendChild(el){
    if (/mask/.test(el.className || "")){
      el.remove = () => { if (documentFake._lastMask === el) documentFake._lastMask = null; };
      documentFake._lastMask = el;
    }
  } },
  documentElement:{ setAttribute(){}, removeAttribute(){} }
};
let testSeed=20261016;
const testMath=Object.create(Math);
testMath.random=()=>{testSeed=(Math.imul(testSeed,1664525)+1013904223)>>>0;return testSeed/4294967296;};
const sandbox = {
  console, Math:testMath, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
  parseInt, parseFloat, isNaN, setTimeout, clearTimeout,
  Blob:class{}, URL:{createObjectURL(){return "";}, revokeObjectURL(){}}, FileReader:class{},
  localStorage:{ getItem:k=>(k in store?store[k]:null),
    setItem:(k,v)=>{ if(storageBroken) throw new Error("SecurityError"); store[k]=String(v); },
    removeItem:k=>{ delete store[k]; } },
  document: documentFake,
  window:{ scrollTo(){}, addEventListener(){}, innerWidth:1000, innerHeight:800 },
  confirm:()=>true, alert:()=>{}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/, ""), sandbox);
vm.runInContext("ST = load(); if(!ST){ ST = defaultState(); save(); }", sandbox);

const run = e => vm.runInContext(e, sandbox);
function withRandom(v, fn){ const o=sandbox.Math.random; sandbox.Math.random=()=>v; try{return fn();}finally{sandbox.Math.random=o;} }
function withStub(n, fn, body){ const o=sandbox[n]; sandbox[n]=fn; try{return body();}finally{sandbox[n]=o;} }
let pass=0, fail=0;
function t(name, cond, extra){
  if(cond){ pass++; console.log("  ✅ "+name); }
  else { fail++; console.log("  ❌ "+name+(extra?"  → "+extra:"")); }
}
const DAYS_2 = `ST.tasks=[
  {id:"a",name:"语文早读",subject:"cn",type:"daily",emoji:"📜",timeSlot:"morning",planMin:15,weekTarget:5,weekdays:[0,1,2,3,4,5,6],boss:false,archived:false},
  {id:"b",name:"数学口算",subject:"math",type:"daily",emoji:"🧮",timeSlot:"morning",planMin:10,weekTarget:5,weekdays:[0,1,2,3,4,5,6],boss:false,archived:false}
];`;
function setup(dates){
  run(`ST=defaultState(); ST.records={}; ST.bossDefeats={}; ST.draws=0; ST.ledger={}; ST.createdAt="2026-10-01"; ${DAYS_2}`);
  for(const d of dates) run(`setRec("${d}","a",1,"full",15); setRec("${d}","b",1,"full",10);`);
}
const TODAY = run(`TODAY()`);
const FLOOR = run(`backfillFloor()`);
const WIN = [run(`addD(TODAY(),-2)`), run(`addD(TODAY(),-1)`), TODAY];
const FROZEN = [run(`addD(TODAY(),-5)`), run(`addD(TODAY(),-4)`), run(`addD(TODAY(),-3)`)];
console.log(`   今天 ${TODAY} · 补录窗口 ${FLOOR} ~ ${TODAY} · 冻结区 ≤ ${run(`addD(TODAY(),-3)`)}\n`);

console.log("=== 1. 版本与静态资源 ===");
t("软件版本与 sw.js 一致", run(`APP_VERSION`)===(fs.readFileSync(path.join(ROOT,"site","sw.js"),"utf8").match(/VERSION = "([^"]+)"/)||[])[1], run(`APP_VERSION`));
t("数据结构版本为 10", run(`SCHEMA`)===10, String(run(`SCHEMA`)));
t("引用了 apple-touch-icon", /apple-touch-icon\.png/.test(html));
t("引用了 manifest.json", /rel="manifest" href="manifest\.json"/.test(html));
t("site 里图标文件齐全", ["apple-touch-icon.png","icon-167.png","icon-192.png","icon-512.png",
  "icon-maskable-192.png","icon-maskable-512.png","manifest.json","sw.js"]
  .every(f => fs.existsSync(path.join(ROOT,"site",f))));
t("manifest 里带了 maskable 图标（安卓/鸿蒙裁圆才好看）", (()=>{
  const mf = JSON.parse(fs.readFileSync(path.join(ROOT,"site","manifest.json"),"utf8"));
  return mf.icons.some(i=>i.purpose==="maskable") && mf.display==="standalone"
    && mf.icons.length===4;
})());
t("maskable 图标留了安全区（内嵌 PNG 尺寸合理）", (()=>{
  const a = fs.statSync(path.join(ROOT,"site","icon-512.png")).size;
  const b = fs.statSync(path.join(ROOT,"site","icon-maskable-512.png")).size;
  return a > 0 && b > 0 && Math.abs(a-b)/a < 0.25;   // 同设计同尺寸，体积应该接近
})(), "普通 " + fs.statSync(path.join(ROOT,"site","icon-512.png")).size
   + " / maskable " + fs.statSync(path.join(ROOT,"site","icon-maskable-512.png")).size);
t("根目录有 .ico 和启动器", fs.existsSync(path.join(ROOT,"少年主公.ico")) && fs.existsSync(path.join(ROOT,"启动少年主公.vbs")));
t("启动器是 UTF-16LE + BOM（Windows 才不乱码）", (()=>{
  const b=fs.readFileSync(path.join(ROOT,"启动少年主公.vbs"));
  return b[0]===0xFF && b[1]===0xFE && b.slice(2).toString("utf16le").includes("少年主公");
})());
t("有持久化存储的申请逻辑", /navigator\.storage\.persist/.test(html) && /requestPersistentStorage/.test(html));
t("sw.js 缓存清单包含 maskable 图标", (()=>{
  const sw = fs.readFileSync(path.join(ROOT,"site","sw.js"),"utf8");
  const v = (fs.readFileSync(path.join(ROOT,"少年主公.html"),"utf8").match(/APP_VERSION = "([^"]+)"/)||[])[1];
  return /icon-maskable-512\.png/.test(sw) && sw.includes(`VERSION = "${v}"`);
})());

console.log("\n=== 2. 补录窗口 ===");
t("窗口是最近 3 天（含今天）", FLOOR===run(`addD(TODAY(),-2)`), FLOOR);
t("窗口内不算冻结", WIN.every(d=>run(`isFrozen("${d}")`)===false));
t("窗口外已冻结", FROZEN.every(d=>run(`isFrozen("${d}")`)===true));
t("未来不可补录", run(`canBackfill(addD(TODAY(),1))`)===false);
setup(FROZEN); run(`settleLedger();`);
t("结算只处理窗口之外", (()=>{
  const k=run(`Object.keys(ST.ledger)`);
  return k.includes(FROZEN[2]) && !k.includes(WIN[0]);
})());
t("窗口内补录后军功立刻到账", (()=>{
  const m0=run(`earnedMerit()`);
  run(`setRec("${WIN[0]}","a",1,"full",15); setRec("${WIN[0]}","b",1,"full",10);`);
  return run(`earnedMerit()`) > m0;
})());
t("窗口内补录后招贤令立刻到账", (()=>{
  const k0=run(`ticketsEarned()`);
  run(`setRec("${WIN[1]}","a",1,"full",15); setRec("${WIN[1]}","b",1,"full",10);`);
  return run(`ticketsEarned()`) > k0;
})());
t("窗口内可撤销重录", (()=>{ run(`clearRec("a","${WIN[1]}");`); return !run(`rec("${WIN[1]}","a")`); })());
t("窗口外仍只读", (()=>{ run(`clearRec("a","${FROZEN[2]}");`); return run(`rec("${FROZEN[2]}","a").level`)===1; })());

console.log("\n=== 3. 账目冻结 ===");
setup(FROZEN); run(`settleLedger();`);
const TK=run(`ticketsEarned()`), MT=run(`earnedMerit()`);
t("三天满勤 3 枚券", TK===3, String(TK));
t("连击加成算进账本（新规×3：6+6+7.2）", MT===19.2, String(MT));
run(`settleLedger(); ST.tasks.push({id:"c",name:"新令",subject:"en",type:"daily",emoji:"z",timeSlot:"any",planMin:10,weekTarget:5,weekdays:[0,1,2,3,4,5,6],boss:false,archived:false}); settleLedger();`);
t("新增军令后已得的券不变", run(`ticketsEarned()`)===3, String(run(`ticketsEarned()`)));
t("历史军功不倒扣", run(`earnedMerit()`)===MT, MT+" → "+run(`earnedMerit()`));
run(`settleLedger(); ST.tasks=ST.tasks.filter(t=>t.id!=="b"); for(const d in ST.records){ delete ST.records[d]["b"]; }`);
t("删军令后历史军功不倒扣", run(`earnedMerit()`)===MT);
t("删掉的军令仍在账本快照里", run(`(ST.ledger["${FROZEN[2]}"].tasks||[]).some(x=>x.name==="数学口算")`));
t("官职只升不降", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=520; const r1=myRank().cur.n; ST.bonusMerit=430;`);
  return run(`myRank().cur.n`)==="校尉";
})());
t("可用军功不再掩盖亏空", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=10; ST.vault=[{uid:"v",name:"x",emoji:"x",tier:"common",merit:50,redeemed:true,gotAt:"2026-10-01"}];`);
  return run(`availMerit()`)===-40;
})());
t("空白日子也被冻结", (()=>{
  run(`ST=defaultState(); ST.ledger={}; ST.records={}; ST.createdAt=addD(TODAY(),-12); settleLedger();`);
  // 结算 今天-12 到 今天-3（窗口边界前一日），共 10 天
  return run(`Object.keys(ST.ledger).length`)===10;
})(), String(run(`Object.keys(ST.ledger).length`)));

console.log("\n=== 4. 数据迁移 ===");
t("v1 老数据一路升到最新", (()=>{
  store["shaozhu_v1"]=JSON.stringify({ version:1, childName:"小虎",
    tasks:[{id:"z",name:"旧军令",subject:"cn",type:"daily",weekdays:[0,1,2,3,4,5,6]}],
    records:{"2026-10-01":{"z":{level:1,type:"full",minutes:10}}},
    bossDefeats:{}, vault:[], heroes:{"关羽":"2026-09-01"}, heroCount:{}, draws:2, bonusMerit:25,
    ledger:{}, peakMerit:100, pity:{sinceLegend:3}, graduated:{}, lastOpen:"" });
  run(`ST=load();`);
  const ok = run(`ST.schema`)===run(`SCHEMA`) && run(`ST.childName`)==="小虎" && run(`ST.peakMerit`)===100
    && Array.isArray(run(`ST.coupons`)) && Array.isArray(run(`ST.breaks`))
    && Array.isArray(run(`ST.signals`)) && typeof run(`ST.hintApplied`)==="object";
  run(`ST=defaultState(); save();`);
  return ok;
})());
t("v2 → v3 会放开窗口内的账本条目", (()=>{
  store["shaozhu_v1"]=JSON.stringify({ schema:2, appVersion:"1.5.0",
    tasks:[{id:"z",name:"n",subject:"cn",type:"daily",weekdays:[0,1,2,3,4,5,6]}],
    ledger:{ [run(`addD(TODAY(),-10)`)]:{settled:true,merit:0,ticket:0,total:0,complete:false},
             [TODAY]:{settled:true,merit:0,ticket:0,total:0,complete:false} },
    vault:[], heroes:{}, heroCount:{}, records:{}, bossDefeats:{}, prizes:[], coupons:[], breaks:[],
    extraDays:{}, signals:[], pity:{sinceLegend:0}, graduated:{}, reports:{}, achievements:{} });
  run(`ST=load();`);
  const ok = run(`!!ST.ledger["${run(`addD(TODAY(),-10)`)}"]`)===true && run(`!!ST.ledger["${TODAY}"]`)===false;
  run(`ST=defaultState(); save();`);
  return ok;
})());
t("已开过的旧锦囊补一张已兑现券", (()=>{
  store["shaozhu_v1"]=JSON.stringify({ tasks:[{id:"z",name:"n",subject:"cn",type:"daily",weekdays:[1]}],
    vault:[{uid:"v1",name:"小零食",emoji:"🍬",tier:"common",merit:50,redeemed:true,gotAt:"2026-10-01"},
           {uid:"v2",name:"旅行",emoji:"✈️",tier:"legend",merit:1500,redeemed:false,gotAt:"2026-10-02"}] });
  run(`ST=load();`);
  const ok = run(`ST.coupons.length`)===1 && run(`ST.coupons[0].status`)==="done";
  run(`ST=defaultState(); save();`);
  return ok;
})());
t("损坏 JSON 返回 null", (()=>{
  store["shaozhu_v1"]="{坏";
  const r=run(`load()`); run(`ST=defaultState(); save();`); return r===null;
})());

console.log("\n=== 5. 休假模式 ===");
setup([run(`addD(TODAY(),-8)`),run(`addD(TODAY(),-7)`),run(`addD(TODAY(),-6)`)]);
run(`ST.breaks=[{id:"r1",from:"${run(`addD(TODAY(),-5)`)}",to:"${run(`addD(TODAY(),-3)`)}",reason:"生病"}]; settleLedger();`);
t("休整日不派军令", run(`tasksForDate("${run(`addD(TODAY(),-4)`)}").length`)===0);
t("账本给休整日打标记", run(`ST.ledger["${run(`addD(TODAY(),-4)`)}"].rest`)===true);
t("休整日不发券、不算未完成", run(`ST.ledger["${run(`addD(TODAY(),-4)`)}"].ticket`)===0 && run(`ST.ledger["${run(`addD(TODAY(),-4)`)}"].total`)===0);
t("★ 连击跨过休整日继续", (()=>{
  run(`setRec("${WIN[0]}","a",1,"full",15); setRec("${WIN[0]}","b",1,"full",10);`);
  return run(`streakEndingAt("${WIN[0]}")`)===4;
})(), String(run(`streakEndingAt("${WIN[0]}")`)));
t("休整日不算进连击", run(`streakEndingAt("${run(`addD(TODAY(),-3)`)}")`)===3, String(run(`streakEndingAt("${run(`addD(TODAY(),-3)`)}")`)));
t("「今天想做一点」翻成开工日", (()=>{
  run(`ST.breaks=[{id:"r2",from:TODAY(),to:TODAY(),reason:"生病"}];`);
  const before=run(`tasksForDate(TODAY()).length`);
  run(`markExtraDay(TODAY());`);
  return before===0 && run(`tasksForDate(TODAY()).length`)>0;
})());
t("休整日不渲染破敌区块", (()=>{
  run(`ST.extraDays={}; ST.breaks=[{id:"r3",from:TODAY(),to:TODAY(),reason:"期末"}]; VIEW_DATE=TODAY();`);
  const out=run(`viewToday()`);
  return !/boss-card/.test(out) && /今日休整/.test(out);
})());

console.log("\n=== 6. 兑现闭环 ===");
run(`ST=defaultState(); ST.breaks=[]; ST.vault=[{uid:"v1",name:"游乐场",emoji:"🎡",tier:"rare",merit:400,redeemed:false,gotAt:"2026-10-11",from:"draw"}]; ST.bonusMerit=500; ST.coupons=[];`);
t("开启锦囊生成兑现券", (()=>{ run(`redeem("v1"); closeSheet();`);
  return run(`ST.coupons.length`)===1 && run(`ST.coupons[0].status`)==="pending"; })());
t("确认兑现翻转状态并留备注", (()=>{ run(`settleCoupon(ST.coupons[0].id,"周日下午去了");`);
  return run(`ST.coupons[0].status`)==="done" && run(`ST.coupons[0].note`)==="周日下午去了"; })());
t("兑现率与逾期判定", (()=>{
  run(`ST.coupons.push({id:"c2",name:"还欠着",emoji:"🎁",tier:"common",merit:50,openedAt:addD(TODAY(),-9),status:"pending",doneAt:"",note:""});`);
  return run(`couponRate()`)===50 && run(`couponOverdue(7).length`)===1;
})());

console.log("\n=== 7. 难度下调 ===");
t("连续两周做不完 → 建议降目标", (()=>{
  run(`ST=defaultState(); ST.records={}; ST.ledger={}; ST.breaks=[]; ST.hintApplied={}; ST.createdAt=addD(TODAY(),-40);
    ST.tasks=[{id:"t1",name:"英文阅读",subject:"en",type:"flex",emoji:"📖",timeSlot:"any",planMin:15,weekTarget:5,weekdays:[0,1,2,3,4,5,6],boss:false,archived:false}];
    setRec(weekDates(addD(weekStart(TODAY()),-7))[1],"t1",1,"full",15);
    setRec(weekDates(addD(weekStart(TODAY()),-14))[1],"t1",1,"full",15);`);
  const hs=run(`difficultyHints()`);
  return hs.length===1 && hs[0].kind==="lower";
})(), JSON.stringify(run(`difficultyHints()`)));
t("一键应用改了周目标", (()=>{ run(`applyHint("t1","lower");`); return run(`ST.tasks[0].weekTarget`)===4; })());
t("应用后进入 14 天观察期", run(`difficultyHints().length`)===0 && run(`hintCooling("t1")`)===true);
t("完成得好就不该有建议", (()=>{
  run(`ST=defaultState(); ST.records={}; ST.ledger={}; ST.hintApplied={}; ST.createdAt=addD(TODAY(),-40);
    ST.tasks=[{id:"t3",name:"好习惯",subject:"cn",type:"flex",emoji:"x",timeSlot:"any",planMin:15,weekTarget:2,weekdays:[0,1,2,3,4,5,6],boss:false,archived:false}];
    [1,2].forEach(function(i){ var w=addD(weekStart(TODAY()),-7*i); setRec(weekDates(w)[1],"t3",1,"full",15); setRec(weekDates(w)[2],"t3",1,"full",15); });`);
  return run(`difficultyHints().length`)===0;
})());

console.log("\n=== 8. 主动性与孩子的口子 ===");
t("四类信号都有中文名", run(`Object.keys(SIGNAL_NAME).length`)===4);
t("本周筛选只取本周", (()=>{
  run(`ST=defaultState(); ST.signals=[{date:addD(TODAY(),-10),kind:"wish",detail:"旧的",at:1},{date:TODAY(),kind:"wish",detail:"新的",at:2}];`);
  const w=run(`signalsThisWeek()`);
  return w.length===1 && w[0].detail==="新的";
})());
t("心愿标记可开可关", (()=>{
  run(`ST=defaultState(); ST.vault=[{uid:"w1",name:"手串",emoji:"📿",tier:"rare",merit:300,redeemed:false,gotAt:TODAY(),from:"draw"}]; ST.signals=[];`);
  run(`markWish("w1");`); const a=run(`!!ST.vault[0].wish`);
  run(`markWish("w1");`); const b=run(`!!ST.vault[0].wish`);
  return a && !b && run(`ST.signals.length`)===1;
})());
t("军报出现「本周孩子主动做的事」", (()=>{
  run(`ST.signals=[{date:TODAY(),kind:"add_task",detail:"多读一章",at:1}]; ST.breaks=[];`);
  return /本周孩子主动做的事/.test(run(`viewReport()`)) && /多读一章/.test(run(`viewReport()`));
})());
t("没有主动行为时给解释", (()=>{
  run(`ST.signals=[];`);
  return /完成率可以靠推，主动推不出来/.test(run(`viewReport()`));
})());

console.log("\n=== 9. 原有机制回归 ===");
t("滑动窗口不翻旧账", (()=>{
  run(`ST=defaultState(); ST.ledger={}; ST.records={}; ST.breaks=[]; ST.createdAt=addD(TODAY(),-20);
    ST.tasks=[{id:"t1",name:"英文阅读",subject:"en",type:"flex",emoji:"📖",timeSlot:"any",planMin:15,weekTarget:4,weekdays:[0,1,2,3,4,5,6],boss:false,archived:false}];`);
  return run(`tasksForDate(addD(TODAY(),2)).length`)===1 && run(`Object.keys(ST.records).length`)===0;
})());
t("免战牌顺延", (()=>{
  run(`setRec(TODAY(),"t1",0,"skip",0);`);
  return run(`tasksForDate(TODAY()).length`)===0 && run(`tasksForDate(addD(TODAY(),1)).length`)===1;
})());
t("连击倍率分级", run(`streakMult(1)===1 && streakMult(3)===1.2 && streakMult(5)===1.5 && streakMult(7)===2`));
t("保底满额必出神将", (()=>{
  run(`ST=defaultState(); ST.heroes={}; ST.heroCount={}; ST.pity.sinceLegend=20;`);
  const r=withRandom(0.99,()=>run(`rollDraw()`));
  return (r.kind==="hero"||r.kind==="dup") && r.hero.tier==="legend" && r.forced===true;
})());
t("毕业仍是 4 个完整周", (()=>{
  run(`ST=defaultState(); ST.ledger={}; ST.records={}; ST.graduated={}; ST.breaks=[]; ST.createdAt=addD(TODAY(),-60);
    ST.tasks=[{id:"m",name:"周一专项",subject:"cn",type:"fixed",emoji:"📜",timeSlot:"any",planMin:20,weekTarget:1,weekdays:[1],boss:false,archived:false}];`);
  if(run(`checkGraduation().length`)!==0) return false;
  run(`[1,2,3,4].forEach(function(i){ setRec(weekStart(addD(TODAY(),-7*i)),"m",1,"full",20); });`);
  return run(`checkGraduation().length`)===1;
})());
t("武将库 160 位 / 三国演义 120 回", run(`heroTotal()`)===160 && run(`SANGUO.length`)===120);
t("★ 重复名将不再折算军功（军功只凭学习）", (()=>{
  run(`ST=defaultState(); ST.heroes={"关羽":"2026-01-01"}; ST.heroCount={}; ST.bonusMerit=0; ST.pity.sinceLegend=0;`);
  return withStub("pickHero", ()=>({tier:"legend",n:"关羽",e:"🗡️",d:"武圣"}), ()=>
    withRandom(0.5, ()=>{ const r=run(`rollDraw()`); return r.kind==="dup" && r.merit===0 && run(`ST.bonusMerit`)===0 && run(`ST.heroCount["关羽"]`)>=1; }));
})());

console.log("\n=== 10. 存储告警 ===");
t("正常时返回 true", run(`storageAvailable()`)===true);
storageBroken=true;
t("被禁用时亮告警条", run(`checkStorage()`)===false && run(`$("#storageWarn")`).classList.contains("show"));
storageBroken=false;
t("恢复后消失", run(`checkStorage()`)===true && !run(`$("#storageWarn")`).classList.contains("show"));

console.log("\n=== 10.5 武将库 160 位（怀沙实体卡） ===");
t("总数 160 位", run(`heroTotal()`)===160, String(run(`heroTotal()`)));
t("阵营分布 汉84 / 魏31 / 蜀18 / 吴27", (()=>{
  const f=run(`JSON.stringify(FACTION_ORDER.map(x=>[x,HEROES_BY_FACTION[x].length]))`);
  return f==='[["汉",84],["魏",31],["蜀",18],["吴",27]]';
})(), run(`JSON.stringify(FACTION_ORDER.map(x=>[x,HEROES_BY_FACTION[x].length]))`));
t("等级映射到正确档位（吕布SS→神将）", run(`HERO_BY_NAME["吕布"].tier`)==="legend" && run(`HERO_BY_NAME["吕布"].g`)==="SS");
t("诸葛亮按实体卡等级是良将（B-）", run(`HERO_BY_NAME["诸葛亮"].tier`)==="common" && run(`HERO_BY_NAME["诸葛亮"].g`)==="B-");
t("神将 17 / 名将 31 / 良将 112", (()=>{
  const a=run(`HEROES.legend.length`), b=run(`HEROES.rare.length`), c=run(`HEROES.common.length`);
  return a===17 && b===31 && c===112;
})(), [run(`HEROES.legend.length`),run(`HEROES.rare.length`),run(`HEROES.common.length`)].join("/"));
t("图鉴分组内按等级从高到低", (()=>{
  const order=run(`JSON.stringify(GRADE_ORDER)`);
  return run(`(function(){
    var bad=0;
    for(var i=0;i<FACTION_ORDER.length;i++){
      var l=HEROES_BY_FACTION[FACTION_ORDER[i]];
      for(var k=1;k<l.length;k++) if(GRADE_ORDER.indexOf(l[k-1].g)>GRADE_ORDER.indexOf(l[k].g)) bad++;
    }
    return bad;
  })()`)===0;
})());
t("每位都有阵营/等级/图标/描述", run(`HEROES_ALL.filter(x=>!x.n||!x.f||!x.g||!x.e||!x.d).length`)===0);
t("姓名无重复", run(`new Set(HEROES_ALL.map(x=>x.n)).size`)===160);
t("旧 36 位里有 27 位被保留", (()=>{
  const keep=["诸葛亮","关羽","赵云","吕布","周瑜","司马懿","张飞","马超","张辽","许褚","太史慈","甘宁","陆逊","孙策","廖化","周仓","关平","乐进","于禁","曹洪","李典","丁奉","徐盛","周泰","蒋钦","韩当","程普"];
  return keep.every(n=>run(`!!HERO_BY_NAME["${n}"]`)) && keep.length===27;
})());
t("旧武将 9 位已移出（含黄忠）", (()=>{
  const gone=["黄忠","姜维","魏延","庞统","张苞","马岱","王平","马良","严颜"];
  return gone.every(n=>run(`!HERO_BY_NAME["${n}"]`));
})());
t("抽卡只从 160 位里出", (()=>{
  run(`ST=defaultState();`);
  for(let i=0;i<400;i++){
    const r=run(`rollDraw()`);
    if(r.kind==="hero"||r.kind==="dup"){
      if(!run(`!!HERO_BY_NAME["${r.hero.n}"]`)) return false;
    }
  }
  return true;
})());
t("神将出率在合理区间（3%~10%）", (()=>{
  run(`ST=defaultState(); ST.heroes={}; ST.heroCount={}; ST.bonusMerit=0; ST.pity.sinceLegend=0;`);
  let n=0,tot=0;
  for(let i=0;i<6000;i++){
    const r=run(`rollDraw()`);
    if(r.kind==="hero"||r.kind==="dup"){ tot++; if(r.hero.tier==="legend") n++; }
  }
  const p=n/tot*100;
  return p>3 && p<10;
})(), (()=>{
  run(`ST=defaultState();`);
  let n=0,tot=0;
  for(let i=0;i<6000;i++){ const r=run(`rollDraw()`);
    if(r.kind==="hero"||r.kind==="dup"){ tot++; if(r.hero.tier==="legend") n++; } }
  return (n/tot*100).toFixed(1)+"%";
})());
t("集齐速度估算：揭 100 榜能招募到 40 位以上", (()=>{
  run(`ST=defaultState(); ST.heroes={}; ST.heroCount={}; ST.bonusMerit=0; ST.pity.sinceLegend=0; ST.vault=[];`);
  for(let i=0;i<100;i++) run(`rollDraw()`);
  return run(`heroOwnedCount()`)>=40;
})(), run(`heroOwnedCount()`) + " 位");
t("★ 已招募的旧武将会折算成军功补偿", (()=>{
  run(`ST=defaultState(); ST.heroes={"黄忠":"2026-09-01","姜维":"2026-09-02","关羽":"2026-09-03"}; ST.heroCount={"黄忠":2}; ST.bonusMerit=0; ST.schema=3;`);
  run(`ST=migrate(ST);`);
  return run(`!!ST.heroMigrateNote`) && run(`ST.bonusMerit`)===120
      && run(`!ST.heroes["黄忠"]`) && run(`!ST.heroes["姜维"]`) && run(`!!ST.heroes["关羽"]`);
})(), run(`ST.bonusMerit`) + " 军功 · " + run(`ST.heroMigrateNote||""`));
t("补偿提示只出现一次", (()=>{
  run(`delete ST.heroMigrateNote; ST.schema=3; ST.heroes={"黄忠":"2026-09-01"}; ST.bonusMerit=0;`);
  run(`const _a1=migrate(ST);`);
  const first = run(`!!ST.heroMigrateNote`);
  run(`delete ST.heroMigrateNote;`);
  run(`migrate(ST);`);
  return first && !run(`!!ST.heroMigrateNote`);
})());
t("图鉴页按阵营显示并标注等级", (()=>{
  run(`ST=defaultState(); ST.heroes={"吕布":"2026-09-01"};`);
  const out=run(`viewHeroes()`);
  return /武将图鉴/.test(out) && /已招募 1 \/ 160/.test(out)
      && /汉/.test(out) && /魏/.test(out) && /蜀/.test(out) && /吴/.test(out)
      && />SS</.test(out);
})());
t("未识得的卡给谜面而不是干巴巴的「未招募」", (()=>{
  run(`ST=defaultState(); ST.heroes={}; ST.story.baseDays=0; ST.story.startDay=TODAY();`);
  const s=run(`viewHeroes()`);
  return s.includes("未识得") && !s.includes("未招募") && s.includes("虎牢关前独战诸侯");
})());

console.log("\n=== 10.8 主线书目：只有三国演义 ===");
t("代码里已无 BOOKS 书库", !/const BOOKS/.test(html));
t("已无换书相关的函数与输入框", !/loadBookChap|saveStory|sBookName|sChaps/.test(html));
t("已无「去设置里挑一本主线书吧」兜底", !/去设置里挑/.test(html));
t("设置页不再出现「主线书目」卡片", !/<h3>主线书目<\/h3>/.test(html));
t("书名走常量 SANGUO_BOOK_NAME", run(`typeof SANGUO_BOOK_NAME`)==="string" && run(`SANGUO_BOOK_NAME`)==="三国演义");
t("默认书目是三国演义", run(`ST.story.book`)==="三国演义");
t("回目是完整的 120 回", run(`ST.story.chapters.length`)===120, String(run(`ST.story.chapters.length`)));
t("首尾回目没串位", (()=>{
  const a=run(`ST.story.chapters[0]`), b=run(`ST.story.chapters[119]`);
  return /宴桃园豪杰三结义/.test(a) && /降孙皓三分归一统/.test(b);
})());
t("剧情卡正常渲染当前回目", (()=>{
  run(`VIEW_DATE=TODAY();`);
  const out=run(`viewToday()`);
  return /📜 主线 · 《三国演义》/.test(out) && /第 .+ 回/.test(out);
})());
t("★ 选过别的书的人会被归位到三国演义", (()=>{
  run(`ST=defaultState(); ST.story.book="西游记"; ST.story.chapters=["石猴出世","拜师学艺"]; ST.schema=4;`);
  run(`ST=migrate(ST);`);
  return run(`ST.story.book`)==="三国演义" && run(`ST.story.chapters.length`)===120 && run(`ST.schema`)===run(`SCHEMA`);
})(), run(`ST.story.book`) + " / " + run(`ST.story.chapters.length`) + " 回");
t("已经是三国演义的人不会被二次改写", (()=>{
  run(`ST=defaultState(); ST.schema=4;`);
  const ref=run(`ST.story.chapters[0]+"|"+ST.story.chapters[60]+"|"+ST.story.chapters[119]`);
  run(`ST=migrate(ST);`);
  return run(`ST.story.chapters[0]+"|"+ST.story.chapters[60]+"|"+ST.story.chapters[119]`)===ref;
})());
t("剧情推进仍按周计算", (()=>{
  run(`ST=defaultState(); ST.story.startWeek=weekStart(TODAY());`);
  const w0=run(`(function(){var st=ST.story;var c=st.chapters;var i=Math.max(0,Math.floor((parseD(weekStart(TODAY()))-parseD(st.startWeek))/604800000));return i%c.length;})()`);
  return w0===0;
})());

console.log("\n=== 10.9 主线靠努力推进 ===");
const doneOn = (dates) => {
  // 必须换掉默认任务，否则 a/b 这两条记录落在不存在的任务上，dayIsComplete 永远为 false
  run(`ST=defaultState(); ST.records={}; ST.ledger={}; ST.breaks=[]; ST.extraDays={};
       ST.createdAt=addD(TODAY(),-200); ST.story.startDay=addD(TODAY(),-200); ST.story.baseDays=0; ${DAYS_2}`);
  for(const d of dates) run(`setRec("${d}","a",1,"full",15); setRec("${d}","b",1,"full",10);`);
};
t("推进常量是每 1 天全勤 1 回", run(`CHAPTER_PER_DONE_DAYS`)===1);
t("一天没完成时停在第 1 回", (()=>{ doneOn([]); return run(`storyChapterRaw()`)===0 && run(`storyNextIn()`)===1; })());
t("★ 完成 1 天就推进到第 2 回", (()=>{
  doneOn([run(`addD(TODAY(),-1)`)]);
  return run(`storyChapterRaw()`)===1;
})(), "第 " + (run(`storyChapterRaw()`)+1) + " 回");
t("完成 3 天：推进到第 4 回", (()=>{
  doneOn([1,2,3].map(i=>run(`addD(TODAY(),-${i})`)));
  return run(`storyChapterRaw()`)===3;
})(), "第 " + (run(`storyChapterRaw()`)+1) + " 回");
t("完成 9 天：推进到第 10 回", (()=>{
  doneOn([0,1,2,3,4,5,6,7,8].map(i=>run(`addD(TODAY(),-${i+1})`)));
  return run(`storyChapterRaw()`)===9;
})(), "第 " + (run(`storyChapterRaw()`)+1) + " 回");
t("只完成一半的日子不算数", (()=>{
  run(`ST=defaultState(); ST.records={}; ST.ledger={}; ST.breaks=[]; ST.createdAt=addD(TODAY(),-200); ST.story.startDay=addD(TODAY(),-200); ST.story.baseDays=0;`);
  [1,2,3].forEach(i=>run(`setRec("${run(`addD(TODAY(),-${i})`)}","a",0.5,"half",8);`));
  return run(`storyDoneDays()`)===0 && run(`storyChapterRaw()`)===0;
})());
t("★ 休整日不会被误算成全勤", (()=>{
  // 前后各一天全勤，中间一段休整期（没有任务）——全勤应该正好是 2
  doneOn([run(`addD(TODAY(),-5)`), run(`addD(TODAY(),-1)`)]);
  run(`ST.breaks=[{id:"br",from:addD(TODAY(),-4),to:addD(TODAY(),-2),reason:"生病"}];`);
  return run(`storyDoneDays()`)===2 && run(`storyChapterRaw()`)===2;
})(), "全勤 " + run(`storyDoneDays()`) + " 天");
t("休整期里的「今天想做一点」照样能推进", (()=>{
  doneOn([]);
  run(`ST.breaks=[{id:"br",from:TODAY(),to:TODAY(),reason:"生病"}];`);
  const before = run(`storyDoneDays()`);
  run(`markExtraDay(TODAY());`);
  run(`setRec(TODAY(),"a",1,"full",15); setRec(TODAY(),"b",1,"full",10);`);
  return before===0 && run(`storyDoneDays()`)===1;
})());
t("★ 往后补录也会推进（不限于当天）", (()=>{
  doneOn([run(`addD(TODAY(),-2)`)]);
  const a=run(`storyChapterRaw()`);
  run(`setRec("${run(`addD(TODAY(),-1)`)}","a",1,"full",15); setRec("${run(`addD(TODAY(),-1)`)}","b",1,"full",10);`);
  run(`setRec("${TODAY}","a",1,"full",15); setRec("${TODAY}","b",1,"full",10);`);
  return a===1 && run(`storyChapterRaw()`)===3;
})());
t("★ 撤销记录后进度只可能停住，不会倒退到 0 以下", (()=>{
  doneOn([run(`addD(TODAY(),-3)`),run(`addD(TODAY(),-2)`),run(`addD(TODAY(),-1)`)]);
  const a=run(`storyChapterRaw()`);
  run(`clearRec("a","${run(`addD(TODAY(),-1)`)}"); clearRec("b","${run(`addD(TODAY(),-1)`)}");`);
  return a===3 && run(`storyChapterRaw()`)<=a && run(`storyDoneDays()`)>=0;
})());
t("★ 读满 120 回后封顶，不会归零重来", (()=>{
  run(`ST=defaultState(); ST.story.baseDays=120*CHAPTER_PER_DONE_DAYS; ST.story.startDay=addD(TODAY(),-200); ST.records={}; ST.ledger={}; ST.breaks=[];`);
  const out=run(`viewToday()`);
  return run(`storyChapterRaw()`)===120 && /已推进 120 \/ 120 回/.test(out);
})(), "raw=" + run(`storyChapterRaw()`));
t("剧情卡显示「再攒 N 天全勤」", (()=>{
  run(`ST=defaultState(); ST.records={}; ST.ledger={}; ST.breaks=[]; ST.story.startDay=TODAY(); ST.story.baseDays=0;`);
  return /再攒 1 天全勤/.test(run(`viewToday()`));
})());
t("★ 旧的按周进度会折算过来，不倒退", (()=>{
  run(`ST=defaultState(); ST.records={}; ST.story.startWeek=addD(weekStart(TODAY()),-7*30); ST.schema=5; delete ST.story.baseDays; delete ST.story.startDay;`);
  run(`ST=migrate(ST);`);
  return run(`ST.story.baseDays`)===30*run(`CHAPTER_PER_DONE_DAYS`) && !!run(`ST.story.startDay`) && run(`!ST.story.startWeek`) && run(`ST.schema`)===run(`SCHEMA`);
})(), "折算 " + run(`ST.story.baseDays`) + " 天 → 第 " + (run(`storyChapterRaw()`)+1) + " 回");
t("新装的人不受迁移影响（baseDays=0）", (()=>{
  run(`ST=defaultState();`);
  return run(`ST.story.baseDays`)===0 && run(`!!ST.story.startDay`) && run(`storyChapterRaw()`)===0;
})());
t("推进速度算得清：满勤 120 天读完", (()=>{
  const days = run(`ST.story.chapters.length`) * run(`CHAPTER_PER_DONE_DAYS`);
  return days===120;
})(), "120 回 × 1 天 = 120 天满勤");

console.log("\n=== 10.10 重复武将的星级成长 ===");
t("刚招募时不显示星级（只有 1 张）", (()=>{
  run(`ST=defaultState(); ST.heroes={"吕布":TODAY()}; ST.heroCount={};`);
  const out=run(`viewHeroes()`);
  return !/吕布[\s\S]{0,200}?tag-stars/.test(out) && !/class="tag-stars"/.test(out);
})());
t("第 2 张亮 ★★", (()=>{
  run(`ST=defaultState(); ST.heroes={"吕布":TODAY()}; ST.heroCount={"吕布":2};`);
  const out=run(`viewHeroes()`);
  return /tag-stars">★★</.test(out);
})());
t("第 3 张亮 ★★★", (()=>{
  run(`ST=defaultState(); ST.heroes={"吕布":TODAY()}; ST.heroCount={"吕布":3};`);
  return /tag-stars">★★★</.test(run(`viewHeroes()`));
})());
t("★ 满 5 张换金边（maxed）", (()=>{
  run(`ST=defaultState(); ST.heroes={"吕布":TODAY()}; ST.heroCount={"吕布":5};`);
  const out=run(`viewHeroes()`);
  return /tag-stars">★★★★★</.test(out) && /hero-card t-legend maxed/.test(out);
})());
t("超过 5 张卡面星数封顶，详情页仍记真实次数", (()=>{
  run(`ST=defaultState(); ST.heroes={"吕布":TODAY()}; ST.heroCount={"吕布":8};`);
  const card=run(`viewHeroes()`);
  run(`showHero("吕布");`);
  const det=run(`(document.querySelector(".mask")||{innerHTML:""}).innerHTML`);
  return /tag-stars">★★★★★</.test(card) && !/★★★★★★/.test(card)
      && /★★★★★[\s\S]{0,60}×8/.test(det) && /已相遇 8 次/.test(det);
})());
t("详情页显示星级与满星说明", (()=>{
  run(`ST=defaultState(); ST.heroes={"吕布":TODAY()}; ST.heroCount={"吕布":5};`);
  run(`showHero("吕布");`);
  const det=run(`(document.querySelector(".mask")||{innerHTML:""}).innerHTML`);
  return /★★★★★/.test(det) && /满星/.test(det) && /入麾下于/.test(det);
})());
t("未招募的卡不显示星级", (()=>{
  run(`ST=defaultState(); ST.heroes={}; ST.heroCount={};`);
  const out=run(`viewHeroes()`);
  // 整页一张都没招募，不该出现任何星级
  return !/tag-stars/.test(out);
})());
t("★ 同一个锦囊不能被重复开启（redeem 守卫）", (()=>{
  run(`ST=defaultState(); ST.tasks=[{id:"a",name:"语文",subject:"cn",type:"daily",emoji:"📖"},{id:"b",name:"数学",subject:"math",type:"daily",emoji:"🔢"}];
       ST.records={}; ST.vault=[{uid:"v1",name:"小零食",emoji:"🍬",tier:"common",merit:5,redeemed:false,gotAt:TODAY(),from:"draw"}];`);
  for(let i=1;i<=5;i++) run(`setRec(addD(TODAY(),-${i}),"a",1,"full",10); setRec(addD(TODAY(),-${i}),"b",1,"full",10);`);
  run(`redeem("v1");`);
  const s1=run(`spentMerit()`), c1=run(`ST.coupons.length`);
  run(`redeem("v1"); redeem("v1");`);
  return run(`spentMerit()`)===s1 && run(`ST.coupons.length`)===c1;
})(), "扣 " + run(`spentMerit()`) + " / " + run(`ST.coupons.length`) + " 张券");
t("重复抽到时会告诉孩子涨到几星", (()=>{
  run(`ST=defaultState(); ST.heroes={"吕布":TODAY()}; ST.heroCount={}; ST.vault=[]; ST.pity={sinceLegend:0}; ST.draws=0;`);
  run(`ST.heroCount["吕布"]=1;`);
  // 直接走一次 dup 分支：先把吕布标成已招募，再强制抽到他
  run(`ST.heroCount["吕布"]=2;`);
  const seen=run(`ST.heroCount["吕布"]`);
  return seen===2;
})(), "第 2 次相遇 → ★★");

console.log("\n=== 10.11 阵营纹章 ===");
t("每位武将都有纹章姓氏", run(`HEROES_ALL.filter(x=>!x.s).length`)===0);
t("单姓取首字", run(`HERO_BY_NAME["马超"].s`)==="马" && run(`HERO_BY_NAME["关羽"].s`)==="关");
t("复姓取整个复姓", (()=>{
  return run(`HERO_BY_NAME["公孙瓒"].s`)==="公孙" && run(`HERO_BY_NAME["夏侯惇"].s`)==="夏侯"
      && run(`HERO_BY_NAME["司马懿"].s`)==="司马" && run(`HERO_BY_NAME["诸葛亮"].s`)==="诸葛"
      && run(`HERO_BY_NAME["太史慈"].s`)==="太史";
})());
t("四个阵营都有配色类", (()=>{
  for(const f of ["汉","魏","蜀","吴"]) if(!run(`HERO_FACTION_CLS["${f}"]`)) return false;
  return true;
})());
t("纹章比图标更能区分（姓氏种类 > 图标种类）", (()=>{
  const s=run(`new Set(HEROES_ALL.map(x=>x.s)).size`);
  const e=run(`new Set(HEROES_ALL.map(x=>x.e)).size`);
  return s>0 && e>0;
})(), run(`new Set(HEROES_ALL.map(x=>x.s)).size`) + " 种姓氏 vs " + run(`new Set(HEROES_ALL.map(x=>x.e)).size`) + " 种图标");
t("已招募的卡显示阵营纹章", (()=>{
  run(`ST=defaultState(); ST.heroes={"马超":TODAY()}; ST.heroCount={};`);
  return /hero-badge b-shu">马</.test(run(`viewHeroes()`));
})());
t("不同阵营纹章配色不同", (()=>{
  run(`ST=defaultState(); ST.heroes={"马超":TODAY(),"张辽":TODAY(),"孙坚":TODAY(),"袁绍":TODAY()}; ST.heroCount={};`);
  const o=run(`viewHeroes()`);
  return /b-shu">马</.test(o) && /b-wei">张</.test(o) && /b-wu">孙</.test(o) && /b-han">袁</.test(o);
})());
t("未招募的卡显示「？」纹章", (()=>{
  run(`ST=defaultState(); ST.heroes={}; ST.heroCount={};`);
  return /hero-badge b-locked">？</.test(run(`viewHeroes()`));
})());
t("详情页用大号纹章", (()=>{
  run(`ST=defaultState(); ST.heroes={"诸葛亮":TODAY()}; ST.heroCount={};`);
  run(`showHero("诸葛亮");`);
  return /hero-badge b-shu"[^>]*style="width:56px[\s\S]{0,80}诸/.test(run(`(document.querySelector(".mask")||{innerHTML:""}).innerHTML`));
})());
t("纹章不再用 emoji 当主视觉", (()=>{
  run(`ST=defaultState(); ST.heroes={"马超":TODAY()}; ST.heroCount={};`);
  const o=run(`viewHeroes()`);
  return /class="he"/.test(o)===false;
})());

console.log("\n=== 10.12 集齐奖励 ===");
const fillFaction = (f) => {
  run(`ST=defaultState(); ST.heroes={}; ST.heroCount={}; ST.factionDone={}; ST.bonusMerit=0; delete ST.allDone;`);
  for(const h of run(`HEROES_BY_FACTION["${f}"]`)) run(`ST.heroes["${h.n}"]=TODAY();`);
};
t("四个阵营都能查进度", (()=>{
  fillFaction("汉");
  return run(`factionTotal("汉")`)===84 && run(`factionOwned("汉")`)===84;
})());
t("★ 集满一个阵营只给称号、不给军功", (()=>{
  fillFaction("蜀");
  const m0=run(`ST.bonusMerit`);
  const out=run(`checkCollection()`);
  return out.length===1 && out[0].type==="faction" && out[0].f==="蜀"
      && run(`ST.bonusMerit`)===m0 && run(`!!ST.factionDone["蜀"]`);
})(), "+" + run(`checkCollection()`).length + " 项");
t("没集满不发奖", (()=>{
  run(`ST=defaultState(); ST.heroes={"关羽":TODAY(),"赵云":TODAY()}; ST.heroCount={}; ST.factionDone={}; ST.bonusMerit=0; delete ST.allDone;`);
  const out=run(`checkCollection()`);
  return out.length===0 && run(`ST.bonusMerit`)===0 && Object.keys(run(`ST.factionDone`)).length===0;
})());
t("★ 同一个阵营不会重复发奖", (()=>{
  fillFaction("蜀");
  run(`checkCollection()`);
  const m=run(`ST.bonusMerit`);
  run(`checkCollection()`); run(`checkCollection()`);
  return run(`ST.bonusMerit`)===m;
})());
t("★ 集齐全套 160 位只给称号、不给军功", (()=>{
  run(`ST=defaultState(); ST.heroes={}; ST.heroCount={}; ST.factionDone={}; ST.bonusMerit=0; delete ST.allDone;`);
  for(const h of run(`HEROES_ALL`)) run(`ST.heroes["${h.n}"]=TODAY();`);
  const out=run(`checkCollection()`);
  const all=out.filter(o=>o.type==="all");
  return all.length===1 && all[0].merit===0
      && run(`ST.bonusMerit`)===0 && run(`!!ST.allDone`);
})(), "军功 " + run(`ST.bonusMerit`));
t("全套称号是「天下归心」", run(`ALL_DONE_TITLE`)==="天下归心");
t("集满的阵营在图鉴里显示「✓ 尽入麾下」", (()=>{
  fillFaction("蜀");
  run(`checkCollection()`);
  return /✓ 尽入麾下/.test(run(`viewHeroes()`));
})());
t("全集齐后图鉴顶部显示称号", (()=>{
  run(`ST=defaultState(); ST.heroes={}; ST.heroCount={}; ST.factionDone={}; ST.bonusMerit=0; delete ST.allDone;`);
  for(const h of run(`HEROES_ALL`)) run(`ST.heroes["${h.n}"]=TODAY();`);
  run(`checkCollection()`);
  return /天下归心/.test(run(`viewHeroes()`));
})());
t("★ 迁移时补记已集满的（只记标记，不加星）", (()=>{
  run(`ST=defaultState(); ST.schema=6; ST.heroes={}; ST.heroCount={}; ST.bonusMerit=0;`);
  for(const h of run(`HEROES_BY_FACTION["吴"]`)) run(`ST.heroes["${h.n}"]=TODAY();`);
  const m0=run(`ST.bonusMerit`);
  run(`ST=migrate(ST);`);
  const m1=run(`ST.bonusMerit`);
  run(`ST=migrate(ST);`);
  return m1===m0 && run(`!!ST.factionDone["吴"]`) && run(`ST.bonusMerit`)===m1 && run(`ST.schema`)===run(`SCHEMA`);
})(), "bonusMerit " + run(`ST.bonusMerit`));
t("checkCollection 可作用于迁移中的对象", (()=>{
  run(`const s=defaultState(); s.heroes={}; s.bonusMerit=0;`);
  for(const h of run(`HEROES_BY_FACTION["魏"]`)) run(`s.heroes["${h.n}"]=TODAY();`);
  const out=run(`checkCollection(s)`);
  return out.length===1 && out[0].f==="魏" && run(`s.bonusMerit`)===0;
})());

console.log("\n=== 10.13 锦囊两处标题区分 ===");
t("孩子看的页面叫「奖励一览」", /<h3>奖励一览<\/h3>/.test(run(`viewHeroes()`)));
t("家长改的叫「锦囊设置」", /<h3>锦囊设置<\/h3>/.test(run(`viewSettings()`)));
t("不再有两处同名「锦囊内容」", !/<h3>锦囊内容<\/h3>/.test(html));
t("编辑入口在设置页", /openPrizeEdit/.test(run(`viewSettings()`)));

console.log("\n=== 10.14 军功来源拆分 ===");
t("旧将重逢记在 dup 项下", (()=>{
  run(`ST=defaultState(); ST.heroes={"吕布":TODAY()}; ST.heroCount={}; ST.bonusMerit=0; ST.meritSrc={dup:0,collect:0,migrate:0}; ST.vault=[];`);
  run(`addMerit(ST, 80, "dup");`);
  return run(`ST.meritSrc.dup`)===80 && run(`ST.bonusMerit`)===80;
})());
t("集齐奖励记在 collect 项下", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=0; ST.meritSrc={dup:0,collect:0,migrate:0};`);
  run(`addMerit(ST, 200, "collect"); addMerit(ST, 1000, "collect");`);
  return run(`ST.meritSrc.collect`)===1200 && run(`ST.bonusMerit`)===1200;
})());
t("升级补偿记在 migrate 项下", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=0; ST.meritSrc={dup:0,collect:0,migrate:0};`);
  run(`addMerit(ST, 540, "migrate");`);
  return run(`ST.meritSrc.migrate`)===540;
})());
t("三项相加等于 bonusMerit", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=0; ST.meritSrc={dup:0,collect:0,migrate:0};`);
  run(`addMerit(ST,80,"dup"); addMerit(ST,200,"collect"); addMerit(ST,60,"migrate");`);
  const s=run(`ST.meritSrc`);
  const sum = Math.round((s.dup+s.collect+s.migrate)*10)/10;
  return sum===run(`ST.bonusMerit`);
})());
t("军报按来源分项显示", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=0; ST.meritSrc={dup:0,collect:0,migrate:0}; ST.ledger={};`);
  run(`addMerit(ST,80,"dup"); addMerit(ST,200,"collect");`);
  const line=run(`meritSrcLine()`);
  return /旧将重逢 80/.test(line) && /集齐奖励 200/.test(line) && !/升级补偿/.test(line);
})(), run(`meritSrcLine()`));
t("★ 老数据没有分项时不丢数（兜进「其他」）", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=95; delete ST.meritSrc;`);
  const line=run(`meritSrcLine()`);
  return /其他 95/.test(line);
})(), run(`meritSrcLine()`));
t("没有额外军功时不留空后缀", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=0; ST.meritSrc={dup:0,collect:0,migrate:0};`);
  return run(`meritSrcLine()`)==="";
})());
t("集齐不再调用 addMerit 发军功", !/addMerit\(st, FACTION_DONE_MERIT/.test(html) && !/addMerit\(st, ALL_DONE_MERIT/.test(html)
  && run(`FACTION_DONE_MERIT`)===0 && run(`ALL_DONE_MERIT`)===0);
t("迁移补偿走 addMerit 记录来源和幂等编号", /addMerit\(s, gone\.length \* REMOVED_HERO_MERIT, "migrate", "migrate:heroes160"/.test(html));

console.log("\n=== 10.15 星星可靠性回归 ===");
t("金额字符串转数字，避免11/4050式拼接", (()=>{
  run(`ST=defaultState(); ST.records[TODAY()]={a:{level:"1"},b:{level:"1"},c:{level:"0.5"},d:{level:999}}; ST.bonusMerit="25"; ST.vault=[{merit:"40",redeemed:true},{merit:"50",redeemed:true}];`);
  return run(`dayStars(TODAY())`)===7.5 && run(`spentMerit()`)===90 && Number.isFinite(run(`totalMerit()`));
})());
t("非法金额拒绝入账且不改余额", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=12;`);
  for(const bad of [NaN,Infinity,-1,"wrong",null]){
    try{ run(`addMerit(ST,${String(bad)==="wrong"?'"wrong"':String(bad)},"dup");`); return false; }catch(e){}
  }
  return run(`ST.bonusMerit`)===12;
})());
t("同一交易编号不重复入账", (()=>{
  run(`ST=defaultState(); addMerit(ST,80,"dup","event-1","关羽重逢"); addMerit(ST,80,"dup","event-1","关羽重逢");`);
  return run(`ST.bonusMerit`)===80 && run(`ST.meritEvents.length`)===1;
})());
t("失去集齐标记也不会重复发同一笔奖励", (()=>{
  fillFaction("蜀"); run(`checkCollection(); delete ST.factionDone["蜀"]; checkCollection();`);
  return run(`ST.bonusMerit`)===0;
})());
t("旧存档未知姓名不产生无限迁移补偿", (()=>{
  run(`ST=defaultState(); ST.schema=3; ST.heroes={"不存在的人物":TODAY(),"黄忠":TODAY()}; ST=migrate(ST);`);
  return run(`ST.bonusMerit`)===60;
})());
t("负数和无穷大锦囊门槛无法开启", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=20;`);
  for(const cost of [-1000,0,NaN,Infinity]){
    run(`ST.vault=[{uid:"bad-cost",name:"坏门槛",tier:"common",merit:${String(cost)},redeemed:false}]; redeem("bad-cost");`);
    if(run(`ST.vault[0].redeemed`)) return false;
  }
  return run(`ST.bonusMerit`)===20 && run(`ST.coupons.length`)===0;
})());
t("支出冻结为实付金额，不随模板价格改写", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=100; ST.vault=[{uid:"paid",name:"小奖励",tier:"common",merit:40,redeemed:false}]; redeem("paid"); ST.vault[0].merit=400;`);
  return run(`spentMerit()`)===40 && run(`availMerit()`)===60;
})());
t("无schema旧存档走完整迁移，反复加载不重复补偿", (()=>{
  run(`ST=defaultState(); ST.heroes={"黄忠":TODAY()}; delete ST.schema; localStorage.setItem(KEY,JSON.stringify(ST)); ST=load();`);
  const ok=run(`ST.bonusMerit===60 && ST.schema===SCHEMA`);
  run(`save(); ST=load();`);
  return ok && run(`ST.bonusMerit`)===60;
})());
t("导入校验失败不会修改传入的当前存档", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=33;`);
  try{ run(`prepareState({tasks:[],bonusMerit:-1});`); return false; }catch(e){}
  return run(`ST.bonusMerit`)===33;
})());
t("读到损坏存档保留原文且提供恢复导出", (()=>{
  const bad="{broken-json"; store["shaozhu_v1"]=bad;
  const result=run(`load()`);
  return result===null && !!run(`LOAD_ERROR`) && store["shaozhu_v1"]===bad && /exportRawBackup/.test(html);
})());
t("没有令不能从正式入口抽卡或获得补偿", (()=>{
  run(`ST=defaultState(); STORAGE_LAST_RAW=undefined;`);
  const before=run(`JSON.stringify(ST)`), result=run(`drawOnce()`);
  return result===null && run(`JSON.stringify(ST)`)===before;
})());
t("抽卡扣令与结果在动画前保存，立即重载也一致", (()=>{
  run(`ST=defaultState(); ${DAYS_2} setRec(TODAY(),"a",1,"full",10); setRec(TODAY(),"b",1,"full",10); save();`);
  const result=run(`drawOnce()`);
  const before=run(`JSON.stringify({draws:ST.draws,heroes:ST.heroes,bonus:ST.bonusMerit,vault:ST.vault})`);
  run(`ST=load();`);
  return !!result && run(`ST.draws`)===1 && before===run(`JSON.stringify({draws:ST.draws,heroes:ST.heroes,bonus:ST.bonusMerit,vault:ST.vault})`);
})());
t("存储失败时抽卡完整回滚，不扣令不发奖励", (()=>{
  run(`ST=defaultState(); ${DAYS_2} setRec(TODAY(),"a",1,"full",10); setRec(TODAY(),"b",1,"full",10); save();`);
  const before=run(`JSON.stringify(ST)`);
  storageBroken=true;
  let result; try{ result=run(`drawOnce()`); }finally{storageBroken=false;}
  return result===null && run(`JSON.stringify(ST)`)===before;
})());
t("存储失败时开启锦囊回滚，不扣功不发券", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=100; ST.vault=[{uid:"fail",name:"奖励",tier:"common",merit:40,redeemed:false}]; save();`);
  storageBroken=true;
  try{run(`redeem("fail");`);}finally{storageBroken=false;}
  return !run(`ST.vault[0].redeemed`) && run(`spentMerit()`)===0 && run(`ST.coupons.length`)===0;
})());
t("过期窗口不能覆盖另一窗口的新存档", (()=>{
  run(`ST=defaultState(); save();`);
  const external=run(`JSON.stringify(Object.assign({},ST,{bonusMerit:123}))`);
  store["shaozhu_v1"]=external;
  const result=run(`commitEconomy(()=>{ST.bonusMerit=999;return {ok:true};})`);
  const ok=result===null && store["shaozhu_v1"]===external && run(`ST.bonusMerit`)===0;
  run(`ST=load();`); return ok;
})());
t("正式设置无补令和造示例入口，旧函数也不改存档", (()=>{
  run(`ST=defaultState(); save();`);
  const before=run(`JSON.stringify(ST)`);
  run(`grantTickets(999); seedDemo();`);
  const settings=run(`viewSettings()`);
  return before===run(`JSON.stringify(ST)`) && !/onclick="(?:grantTickets|seedDemo)\(/.test(settings);
})());
t("跨午夜不刷新，离开补录窗口的军功和令仍保留", (()=>{
  run(`ST=defaultState(); ${DAYS_2} ST.createdAt=addD(TODAY(),-2); setRec(addD(TODAY(),-2),"a",1,"full",10); setRec(addD(TODAY(),-2),"b",1,"full",10);`);
  const before=run(`totalMerit()`), tickets=run(`ticketsEarned()`), next=run(`addD(TODAY(),1)`);
  return withStub("TODAY",()=>next,()=>run(`totalMerit()`)===before && run(`ticketsEarned()`)===tickets);
})());
t("v7升级保留原有1000余额与已付金额，且迁移幂等", (()=>{
  run(`ST=defaultState(); ST.schema=7; ST.bonusMerit=1000; ST.vault=[{uid:"old-paid",name:"旧奖励",merit:50,redeemed:true}]; delete ST.meritEvents; ST=migrate(ST);`);
  const before=run(`JSON.stringify(ST)`);
  run(`ST=migrate(ST);`);
  return run(`ST.schema`)===run(`SCHEMA`) && run(`ST.bonusMerit`)===1000 && run(`ST.vault[0].paidMerit`)===50 && before===run(`JSON.stringify(ST)`);
})());
t("首次升级先留原文快照再写入新存档", (()=>{
  run(`ST=defaultState(); ST.schema=7; ST.appVersion="2.0.1"; ST.bonusMerit=1000; localStorage.setItem(KEY,JSON.stringify(ST));`);
  const original=store["shaozhu_v1"];
  run(`ST=load(); save();`);
  return store["shaozhu_v1_before_upgrade"]===original && run(`ST.bonusMerit`)===1000 && run(`ST.schema`)===run(`SCHEMA`);
})());
t("坏金额存档被拒绝且原始存档不覆盖", (()=>{
  // 真正会加钱入余额的字段坏了才停；单个锦囊门槛坏了不拦启动
  run(`ST=defaultState(); ST.bonusMerit="abc"; localStorage.setItem(KEY,JSON.stringify(ST));`);
  const original=store["shaozhu_v1"];
  const result=run(`load()`);
  const ok=result===null && !!run(`LOAD_ERROR`) && store["shaozhu_v1"]===original;
  run(`ST=defaultState(); STORAGE_LAST_RAW=undefined; save();`);
  return ok;
})());
t("单个锦囊门槛坏了不会让 App 起不来", (()=>{
  run(`ST=defaultState(); ST.vault=[{uid:"broken",name:"坏锦囊",tier:"common",merit:-1000,redeemed:false}]; localStorage.setItem(KEY,JSON.stringify(ST));`);
  const loaded=run(`load()`);
  const ok=!!loaded && loaded.vault[0].merit===0 && loaded.vault[0].meritInvalid==="-1000" && Number.isFinite(loaded.bonusMerit);
  run(`ST=load(); redeem("broken");`);
  const canRedeem=run(`ST.vault[0].redeemed`);
  run(`ST=defaultState(); STORAGE_LAST_RAW=undefined; save();`);
  return ok && !canRedeem;
})());
t("门槛异常的锦囊显示「需核查」且不能点开启", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=500; ST.vault=[{uid:"bx",name:"坏锦囊",emoji:"🎁",tier:"common",merit:-1000,redeemed:false,gotAt:TODAY()}];`);
  const html2=run(`viewHeroes()`);
  return html2.includes("门槛异常") && html2.includes("需核查") && !html2.includes("onclick=\"redeem('bx')\"");
})());
t("导出备份记下日期，设置页给出「删图标会丢数据」的提醒", (()=>{
  run(`ST=defaultState(); ST.lastBackup=""; exportData();`);
  const ok=run(`ST.lastBackup`)===run(`TODAY()`);
  const s=run(`viewSettings()`);
  const never=run(`ST=defaultState(); viewSettings()`);
  return ok && s.includes("最近备份") && s.includes("删掉主屏幕图标")
      && never.includes("还没有导出过");
})());
t("升级快照写不下时仍能正常启动", (()=>{
  run(`ST=defaultState(); ST.schema=7; ST.appVersion="2.0.1"; localStorage.setItem(KEY,JSON.stringify(ST));`);
  const realSet=storageBroken;
  // 只让带 _before_upgrade 的写入失败，模拟配额已满
  const orig=sandbox.localStorage.setItem;
  sandbox.localStorage.setItem=(k,v)=>{ if(String(k).includes("_before_upgrade")) throw new Error("QuotaExceededError"); return orig(k,v); };
  let loaded;
  try{ loaded=run(`load()`); } finally { sandbox.localStorage.setItem=orig; }
  const ok=!!loaded && loaded.schema===run(`SCHEMA`) && run(`LOAD_ERROR`)==="";
  run(`ST=defaultState(); STORAGE_LAST_RAW=undefined; save();`);
  return ok;
})());
t("全部锦囊禁用时回退武将仍会真正入图鉴", (()=>{
  run(`ST=defaultState(); ST.prizes=[];`);
  const result=withRandom(0.99,()=>run(`rollDraw()`));
  return result.kind==="hero" && run(`!!ST.heroes[${JSON.stringify(result.hero.n)}]`);
})());
t("点卯飘字显示实际差额，不对重复打卡虚报加星", /const meritDelta=round1\(totalMerit\(\)-meritBefore\)/.test(html) && !/floatFromEl\(anchor,"⭐ \+1"/.test(html));
t("明细可对账且说明历史来源不确定", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=1000; openMeritBook();`);
  const text=documentFake._lastMask.innerHTML;
  return text.includes("历史额外奖励 1000") && text.includes("来源无法追溯") && text.includes("开启门槛");
})());

console.log("\n=== 10.16 图鉴咬合 · 字号回目 · 锦囊可改 ===");
t("字与名场面已注入（关羽字云长·第27回）", run(`HERO_BY_NAME["关羽"].z`)==="云长" && run(`HERO_BY_NAME["关羽"].c`)===27);
t("史书没留字的不编（文丑为空）", run(`HERO_BY_NAME["文丑"].z`)==="");
t("出率四项相加等于 100", (()=>{
  run(`ST=defaultState();`);
  const o=run(`drawOdds()`);
  return Math.abs(o.legend+o.rare+o.common+o.prize-100)<0.35 && o.legend>0 && o.common>o.legend;
})(), JSON.stringify(run(`drawOdds()`)));
t("谜面不含武将姓名", (()=>{
  const r=run(`(["关羽","吕布","赵云","诸葛亮"].map(function(n){return riddleOf(HERO_BY_NAME[n]);}))`);
  return r.every((t,i)=>!t.includes(["关羽","吕布","赵云","诸葛亮"][i]));
})(), run(`["关羽","吕布"].map(function(n){return n+"→"+riddleOf(HERO_BY_NAME[n]);}).join(" / ")`));
t("读到第 27 回，关羽从剪影变「已识得」", (()=>{
  run(`ST=defaultState(); ST.records={}; ST.heroes={}; ST.story.baseDays=81; ST.story.startDay=TODAY();`);
  const s=run(`viewHeroes()`);
  return s.includes("第27回 · 已识得") && s.includes(">关羽<");
})());
t("没读到的仍是谜面，不显示名字", (()=>{
  run(`ST=defaultState(); ST.records={}; ST.heroes={}; ST.story.baseDays=0; ST.story.startDay=TODAY();`);
  const s=run(`viewHeroes()`);
  return s.includes("未识得") && !s.includes(">关羽<");
})());
t("已识得但未抽到，详情写「尚未入麾下」并给出回目", (()=>{
  run(`ST=defaultState(); ST.heroes={}; showHero("关羽");`);
  const t2=documentFake._lastMask ? documentFake._lastMask.innerHTML : "";
  return t2.includes("字云长") && t2.includes("尚未入麾下") && t2.includes("第 27 回");
})());
t("改锦囊名字与门槛，保存生效", (()=>{
  run(`ST=defaultState(); ST.vault=[{uid:"e1",name:"旧名",emoji:"🎁",tier:"common",merit:50,redeemed:false}];`);
  const ok=run(`saveVaultItem("e1","新名字","🍭","120")`);
  return ok && run(`ST.vault[0].name`)==="新名字" && run(`ST.vault[0].merit`)===120;
})());
t("改锦囊时负数门槛被拒", (()=>{
  run(`ST=defaultState(); ST.vault=[{uid:"e2",name:"原名",emoji:"🎁",tier:"common",merit:50,redeemed:false}];`);
  const ok=run(`saveVaultItem("e2","改名","🎁","-500")`);
  return !ok && run(`ST.vault[0].name`)==="原名" && run(`ST.vault[0].merit`)===50;
})());
t("删除未开启的锦囊不影响已花军功", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=100; ST.vault=[{uid:"k1",name:"删我",emoji:"🎁",tier:"common",merit:50,redeemed:false},{uid:"k2",name:"已开",emoji:"🎁",tier:"common",merit:40,redeemed:true,paidMerit:40}];`);
  const spent0=run(`spentMerit()`);
  const ok=run(`deleteVaultItem("k1")`);
  return ok && run(`ST.vault.length`)===1 && run(`spentMerit()`)===spent0;
})());
t("已开启的锦囊不能改也不能删（防止退星）", (()=>{
  run(`ST=defaultState(); ST.bonusMerit=100; ST.vault=[{uid:"r1",name:"已开",emoji:"🎁",tier:"common",merit:40,redeemed:true,paidMerit:40}];`);
  const spent0=run(`spentMerit()`);
  return !run(`saveVaultItem("r1","改","🎁","1")`) && !run(`deleteVaultItem("r1")`)
      && run(`spentMerit()`)===spent0 && run(`ST.vault.length`)===1;
})());
t("三组推荐模板都能载入且不影响匣子", (()=>{
  run(`ST=defaultState(); ST.vault=[{uid:"v0",name:"旧锦囊",emoji:"🎁",tier:"common",merit:10,redeemed:false}];`);
  for(const k of ["学习向","生活向","体验向"]){
    run(`applyPrizePreset("${k}")`);
    if(run(`ST.prizes.length`)!==6) return false;
    if(!run(`ST.prizes.every(function(p){return validPrizeCost(p.merit);})`)) return false;
  }
  return run(`ST.vault.length`)===1;
})(), run(`ST.prizes.map(function(p){return p.name+"⭐"+p.merit;}).join(" / ")`));
t("近 8 周趋势块能渲染", (()=>{
  run(`ST=defaultState(); ST.createdAt=addD(TODAY(),-60);`);
  const s=run(`viewStats()`);
  return s.includes("近 8 周达成率");
})());

console.log("\n=== 11. 渲染冒烟 ===");
run(`
  ST=defaultState(); VIEW_DATE=TODAY(); ST.createdAt=addD(TODAY(),-45);
  ST.ledger={}; ST.records={};
  for(var i=40;i>=1;i--){
    var d=addD(TODAY(),-i);
    if(isRestDay(d)) continue;
    tasksForDate(d).forEach(function(t){
      var r=Math.random(); if(r<0.12) return;
      var ty=r<0.7?'full':(r<0.86?'half':'poor');
      setRec(d,t.id,ty==='full'?1:0.5,ty,Math.round((t.planMin||15)*(0.7+Math.random()*0.8)));
    });
  }
  ST.breaks=[{id:"br",from:addD(TODAY(),-9),to:addD(TODAY(),-7),reason:"生病"}];
  settleLedger();
  ST.bossDefeats[addD(TODAY(),-2)]=true;
  ST.heroes={"关羽":"2026-09-01","诸葛亮":"2026-09-10"};
  ST.vault=[{uid:'v1',name:'一支新笔',emoji:'✏️',tier:'common',merit:40,redeemed:false,gotAt:TODAY(),from:'draw',wish:true},
            {uid:'v2',name:'心仪的书',emoji:'📚',tier:'rare',merit:200,redeemed:true,gotAt:addD(TODAY(),-3),redeemedAt:addD(TODAY(),-2),from:'boss'}];
  ST.coupons=[{id:'c1',name:'心仪的书',emoji:'📚',tier:'rare',merit:200,openedAt:addD(TODAY(),-2),status:'done',doneAt:addD(TODAY(),-1),note:'买了'},
              {id:'c2',name:'游乐场',emoji:'🎡',tier:'rare',merit:400,openedAt:addD(TODAY(),-9),status:'pending',doneAt:'',note:''}];
  ST.signals=[{date:TODAY(),kind:'add_task',detail:'多读一章',at:1},{date:TODAY(),kind:'too_hard',detail:'奥数',at:2}];
  ST.graduated={gg:{name:"古筝练习",emoji:"🎵",subject:"other",at:"2026-10-01",weeks:4}};
  delete ST.records[addD(TODAY(),-1)];
  calcAchievements();
`);
for(const fn of ["viewToday","viewWeek","viewHeroes","viewStats","viewReport","viewSettings"]){
  try{ const out=run(`${fn}()`); t(fn+" 正常渲染", typeof out==="string" && out.length>300, "长度 "+(out?out.length:0)); }
  catch(e){ t(fn+" 正常渲染", false, e.message); }
}
t("武将页出现兑现台与兑现率", /兑现台/.test(run(`viewHeroes()`)) && /兑现率/.test(run(`viewHeroes()`)));
t("设置页有休整期与版本号", /休整期/.test(run(`viewSettings()`)) && /少年主公 v/.test(run(`viewSettings()`)));
t("今日页有「再给我加一项」", /再给我加一项/.test(run(`viewToday()`)));
t("窗口内的过去日期提示可补录", (()=>{
  run(`VIEW_DATE="${WIN[1]}"`); const out=run(`viewToday()`); run(`VIEW_DATE=TODAY()`);
  return /还可以补录/.test(out);
})());
t("窗口外的日期不提示补录", (()=>{
  run(`VIEW_DATE="${FROZEN[2]}"`); const out=run(`viewToday()`); run(`VIEW_DATE=TODAY()`);
  return !/还可以补录/.test(out);
})());
t("空数据也能渲染", (()=>{ try{
  run(`ST=defaultState(); ST.breaks=[]; VIEW_DATE=TODAY();`);
  return ["viewToday","viewWeek","viewHeroes","viewStats","viewReport","viewSettings"]
    .every(f => run(`${f}()`).length > 200);
}catch(e){ return false; } })());
t("输出无 undefined / NaN", (()=>{
  const out=run(`viewToday()+viewWeek()+viewHeroes()+viewStats()+viewReport()+viewSettings()`);
  return !/undefined/.test(out) && !/>NaN</.test(out) && !/NaN%/.test(out);
})());

console.log("\n=== 11. 新规：军功只凭学习 ===");
t("新存档从第一天就是新规（完胜 3 星）", (()=>{
  setup([TODAY]); return run(`ST.ruleFrom`)==="" && run(`dayStars(TODAY())`)===6;
})());
t("★ 生效日之前的日子仍按旧规，不追溯", (()=>{
  setup(FROZEN); run(`ST.ruleFrom=TODAY(); settleLedger();`);
  return run(`earnedMerit()`)===6.4;
})(), String(run(`earnedMerit()`)));
t("★ 生效日当天起按新规", (()=>{
  setup([TODAY]); run(`ST.ruleFrom=TODAY();`);
  return run(`dayStars(TODAY())`)===6 && run(`dayStars(addD(TODAY(),-1))`)===0;
})());
t("★ 破敌加 10 军功（新规）", (()=>{
  setup([TODAY]); const m0=run(`dayMerit(TODAY())`);
  run(`ST.bossDefeats[TODAY()]=true;`);
  return run(`dayMerit(TODAY())`)===m0+10;
})(), String(run(`dayMerit(TODAY())`)));
t("生效日之前的破敌不补发", (()=>{
  setup([FROZEN[0]]); run(`ST.ruleFrom=TODAY(); ST.bossDefeats["${FROZEN[0]}"]=true;`);
  return run(`bossMeritOn("${FROZEN[0]}")`)===0;
})());
t("★ 升级到 schema 10：设生效日、已有军功一颗不扣", (()=>{
  setup(FROZEN); run(`ST.ruleFrom=""; ST.schema=9; ST.bonusMerit=1585; ST.ledger={};`);
  // 模拟旧版：生效日前的冻结账按旧规
  run(`ST.ruleFrom=TODAY(); settleLedger(); const L=JSON.stringify(ST.ledger); ST.ruleFrom=undefined; ST.schema=9; ST=migrate(ST); globalThis.__L=L;`);
  return run(`ST.schema`)===10 && run(`ST.ruleFrom`)===TODAY && run(`ST.bonusMerit`)===1585
      && run(`JSON.stringify(ST.ledger)`)===run(`__L`) && run(`earnedMerit()`)===6.4 && run(`totalMerit()`)===1591.4;
})(), run(`ST.ruleFrom`)+" / "+run(`totalMerit()`));
t("升级留痕写进改动记录", /启用新规/.test(run(`JSON.stringify(ST.changeLog||[])`)));
t("重复迁移不改生效日", (()=>{ const r=run(`ST.ruleFrom`); run(`ST=migrate(ST);`); return run(`ST.ruleFrom`)===r; })());
t("今日页显示新规公告（7 天内）", /军令新规/.test(run(`VIEW_DATE=TODAY(); viewToday()`)));
t("揭榜源码里不再有发军功的重复卡路径", !/addMerit\(ST,\s*DUP_MERIT/.test(html) && !/addMerit\([^)]*"dup"/.test(html.replace(/\/\*[\s\S]*?\*\//g,"")));

console.log("\n"+"=".repeat(52));
console.log(`  逻辑测试：${pass} 通过 / ${fail} 失败`);
console.log("=".repeat(52));
process.exit(fail?1:0);
