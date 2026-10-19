/* 复现「5 天打卡出现 1000+ 星」：模拟一个全新号用 5 天，逐项打印军功来源 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "少年主公.html"), "utf8");
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

function fakeEl(){const s=new Set();return{innerHTML:'',textContent:'',style:{},value:'',disabled:false,dataset:{},className:'',classList:{add(c){s.add(c)},remove(c){s.delete(c)},toggle(c,f){f?s.add(c):s.delete(c)},contains(c){return s.has(c)}},addEventListener(){},click(){},remove(){},appendChild(){},querySelector(){return fakeEl()},querySelectorAll(){return[]},closest(){return null},getBoundingClientRect(){return{left:0,top:0,width:0,height:0}}};}
const store={}, el={}; const qs=k=>(el[k]=el[k]||fakeEl());
const doc={_m:null,createElement:()=>fakeEl(),querySelector:k=>k==='.mask'?doc._m:qs(k),querySelectorAll:()=>[],addEventListener(){},body:{style:{},appendChild(e){if(/mask/.test(e.className||'')){e.remove=()=>{if(doc._m===e)doc._m=null};doc._m=e}}},documentElement:{setAttribute(){},removeAttribute(){}}};

// 固定「今天」，让模拟可重复
const TODAY_STR = "2026-10-16";
let NOW=TODAY_STR;
const RealDate = Date;
class MockDate extends RealDate {
  constructor(...a){ if(a.length) return new RealDate(...a); super(new RealDate(NOW+"T12:00:00")); }
  static now(){ return new RealDate(NOW+"T12:00:00").getTime(); }
}
const sb={console,Math,Date:MockDate,JSON,Object,Array,String,Number,Boolean,RegExp,Error,parseInt,parseFloat,isNaN,setTimeout:(f)=>{},clearTimeout(){},Blob:class{},URL:{createObjectURL(){return''},revokeObjectURL(){}},FileReader:class{},localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},document:doc,window:{scrollTo(){},addEventListener(){},innerWidth:1000,innerHeight:800},confirm:()=>true,alert:()=>{}};
sb.globalThis=sb; vm.createContext(sb);
vm.runInContext(code.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,''), sb);
const run = e => vm.runInContext(e, sb);

console.log("模拟日：" + TODAY_STR + "（全新号，7 个默认任务，连续 5 天全部完胜）\n");

// 建号 5 天前
run(`ST=defaultState(); ST.createdAt=addD(TODAY(),-4); ST.story.startDay=addD(TODAY(),-4);`);
const ids = run(`ST.tasks.map(t=>t.id)`);
console.log("任务数：" + ids.length);
// 前版脚本把过去第一天当成已过期的历史冻住再继续写，漏算了后写入的任务。
// 这次逐日移动时钟，按真实使用顺序记录；不把29.4等旧结果当固定期望。
let expected=0;
for(let i=4;i>=0;i--){
  NOW=run(`addD("${TODAY_STR}",-${i})`);
  const d=NOW;
  expected=Number((expected+ids.length*(5-i>=5?1.5:5-i>=3?1.2:1)).toFixed(1));
  for(const id of ids) run(`setRec("${d}","${id}",1,"full",15);`);
  run(`settleLedger();`);
  const m = run(`availMerit()`);
  const e = run(`earnedMerit()`), l = run(`ledgerMerit()`), b = run(`ST.bonusMerit||0`);
  console.log(`  ${d}  当日军功 ${run(`dayMerit("${d}")`)}  可用=${m}  (earned=${e} ledger=${l} bonus=${b})`);
}

console.log("\n=== 5 天后的汇总 ===");
console.log("  累计军功 totalMerit()  =", run(`totalMerit()`));
console.log("  点卯所得 earnedMerit() =", run(`earnedMerit()`));
console.log("    其中账本 ledgerMerit =", run(`ledgerMerit()`));
console.log("    其中活窗口实时算     =", run(`round1(earnedMerit()-ledgerMerit())`));
console.log("  旧将重逢 bonusMerit    =", run(`ST.bonusMerit||0`));
console.log("  已花 spentMerit        =", run(`spentMerit()`));
console.log("  可用 availMerit()      =", run(`availMerit()`));
console.log("  账本条目数             =", run(`Object.keys(ST.ledger).length`));
console.log("  有记录的日期           =", run(`Object.keys(ST.records).sort().join(" ")`));

console.log("\n=== 判断 ===");
const tot = run(`totalMerit()`);
const ok=Math.abs(tot-expected)<0.01 && run(`spentMerit()`)===0 && run(`ST.bonusMerit`)===0;
console.log((ok?"  ✅ ":"  ❌ ")+"精确核对：预期 "+expected+"，实际 "+tot);
process.exitCode=ok?0:1;
