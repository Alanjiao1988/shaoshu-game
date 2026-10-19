/* 「正常使用」压力验证：模拟 30 天完整日常，检查军功增长是否合理、有无突增 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "少年主公.html"), "utf8");
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

function fakeEl(){const s=new Set();return{innerHTML:'',textContent:'',style:{},value:'',disabled:false,dataset:{},className:'',classList:{add(c){s.add(c)},remove(c){s.delete(c)},toggle(c,f){f?s.add(c):s.delete(c)},contains(c){return s.has(c)}},addEventListener(){},click(){},remove(){},appendChild(){},querySelector(){return fakeEl()},querySelectorAll(){return[]},closest(){return null},getBoundingClientRect(){return{left:0,top:0,width:0,height:0}}};}
const store={}, el={}; const qs=k=>(el[k]=el[k]||fakeEl());
const doc={_m:null,createElement:()=>fakeEl(),querySelector:k=>k==='.mask'?doc._m:qs(k),querySelectorAll:()=>[],addEventListener(){},body:{style:{},appendChild(e){if(/mask/.test(e.className||'')){e.remove=()=>{if(doc._m===e)doc._m=null};doc._m=e}}},documentElement:{setAttribute(){},removeAttribute(){}}};

let NOW = "2026-10-16";
const RealDate = Date;
class MockDate extends RealDate {
  constructor(...a){ if(a.length) return new RealDate(...a); super(new RealDate(NOW+"T12:00:00")); }
  static now(){ return new RealDate(NOW+"T12:00:00").getTime(); }
}
// 固定随机种子：同一版本重复运行得到相同结果，不拿一次随机结果当保证。
let rngSeed=20261016;
const seededMath=Object.create(Math);
seededMath.random=()=>{ rngSeed=(Math.imul(rngSeed,1664525)+1013904223)>>>0; return rngSeed/4294967296; };
const sb={console,Math:seededMath,Date:MockDate,JSON,Object,Array,String,Number,Boolean,RegExp,Error,parseInt,parseFloat,isNaN,setTimeout:()=>{},clearTimeout(){},Blob:class{},URL:{createObjectURL(){return''},revokeObjectURL(){}},FileReader:class{},localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},document:doc,window:{scrollTo(){},addEventListener(){},innerWidth:1000,innerHeight:800},confirm:()=>true,alert:()=>{}};
sb.globalThis=sb; vm.createContext(sb);
vm.runInContext(code.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,''), sb);
const run = e => vm.runInContext(e, sb);

console.log("=== 30 天正常使用模拟（7 个默认任务，每天全勤，令牌全用来揭榜）===\n");
run(`ST=defaultState(); ST.createdAt=addD(TODAY(),-29); ST.story.startDay=addD(TODAY(),-29); ST.story.baseDays=0;`);
const ids = run(`ST.tasks.map(t=>t.id)`);

let prev = 0, jumps = 0, maxJump = 0;
const violations=[];
let previousBonus=0;
const rows = [];
for(let i=29;i>=0;i--){
  NOW = run(`addD("2026-10-16",-${i})`);
  const d = NOW;
  for(const id of ids) run(`setRec("${d}","${id}",1,"full",15);`);
  run(`settleLedger();`);
  run(`calcAchievements();`);
  // 每天把令牌全用掉（最多 3 枚）
  for(let k=0;k<3;k++){
    if(run(`ticketsAvail()`)>=1){ run(`drawOnce();`); }
  }
  // 军令齐备就破敌
  if(run(`dayIsComplete(TODAY())`) && !run(`bossBeaten(TODAY())`)) run(`attackBoss();`);
  // 有锦囊就开（花军功）
  const un = run(`ST.vault.filter(v=>!v.redeemed)`);
  for(const v of un){ if(run(`availMerit()`)>=v.merit) run(`redeem("${v.uid}")`); }
  const tot = run(`totalMerit()`);
  const jump = tot - prev;
  const bonus=run(`money(ST.bonusMerit)`), spent=run(`spentMerit()`), available=run(`availMerit()`);
  // 不用拍脑袋阈值：总额变化必须=当天点卯+逐笔记录的额外奖励变化。
  const expectedJump=run(`dayMerit(TODAY())`)+(bonus-previousBonus);
  if(Math.abs(jump-expectedJump)>0.11) violations.push(d+" 当日涨幅无法对账 "+jump+" != "+expectedJump);
  if(Math.abs(tot-spent-available)>0.01 || available<0) violations.push(d+" 收支不守恒");
  const eventSum=run(`(ST.meritEvents||[]).reduce((s,e)=>s+e.amount,0)`);
  if(Math.abs(eventSum-bonus)>0.01) violations.push(d+" 奖励流水与余额不符");
  const stateBefore=run(`JSON.stringify({total:totalMerit(),spent:spentMerit(),draws:ST.draws,heroes:ST.heroes})`);
  run(`save(); ST=load();`);
  if(stateBefore!==run(`JSON.stringify({total:totalMerit(),spent:spentMerit(),draws:ST.draws,heroes:ST.heroes})`)) violations.push(d+" 重载后账目变化");
  previousBonus=bonus;
  if(jump > maxJump) maxJump = jump;
  if(jump > 30) jumps++;
  prev = tot;
  if(i%5===0 || i<3) rows.push(`  第 ${30-i} 天  累计=${tot}  点卯=${run(`earnedMerit()`)}  重逢=${run(`ST.bonusMerit||0`)}  已花=${run(`spentMerit()`)}`);
}
rows.forEach(r=>console.log(r));

console.log("\n=== 30 天后汇总 ===");
console.log("  累计军功 totalMerit() =", run(`totalMerit()`));
console.log("  点卯所得 earnedMerit()=", run(`earnedMerit()`));
console.log("  旧将重逢 bonusMerit   =", run(`ST.bonusMerit||0`));
console.log("  已花 spentMerit       =", run(`spentMerit()`));
console.log("  可用 availMerit()     =", run(`availMerit()`));
console.log("  揭榜次数 ST.draws     =", run(`ST.draws`));
console.log("  图鉴招募             =", run(`heroOwnedCount()`) + " / " + run(`heroTotal()`));
console.log("  单日最大涨幅         =", maxJump);
console.log("  涨幅超过 30 的天数   =", jumps);

console.log("\n=== 判定 ===");
const tot = run(`totalMerit()`);
const okRate = Number.isFinite(tot) && tot>=run(`earnedMerit()`);
const okJump = violations.length===0;
const okMono = run(`availMerit()`) <= run(`totalMerit()`);
console.log("  累计等于点卯加奖励：", okRate && Math.abs(tot-run(`earnedMerit()+money(ST.bonusMerit)`))<0.01 ? "✅ " + tot : "❌ " + tot);
console.log("  逐日涨幅、流水、收支、重载对账：", okJump ? "✅ 30天全部一致" : "❌ "+violations.join("; "));
console.log("  可用 ≤ 累计：", okMono ? "✅" : "❌");

console.log("\n=== 每天平均 ===");
console.log("  日均军功 =", (tot/30).toFixed(1), "（7 个任务全完胜约 7~14/天，含倍率）");
process.exitCode=okRate && okJump && okMono?0:1;
