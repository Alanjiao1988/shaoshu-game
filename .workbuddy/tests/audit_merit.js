/* 军功系统漏洞审计：模拟各种"刷"法，看数字会不会不正常增长
   用法：node .workbuddy/tests/audit_merit.js */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "少年主公.html"), "utf8");
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

function fakeEl(){const s=new Set();return{innerHTML:'',textContent:'',style:{},value:'',disabled:false,dataset:{},className:'',classList:{add(c){s.add(c)},remove(c){s.delete(c)},toggle(c,f){f?s.add(c):s.delete(c)},contains(c){return s.has(c)}},addEventListener(){},click(){},remove(){},appendChild(){},querySelector(){return fakeEl()},querySelectorAll(){return[]},closest(){return null},getBoundingClientRect(){return{left:0,top:0,width:0,height:0}}};}
const store={}, el={}; const qs=k=>(el[k]=el[k]||fakeEl());
const doc={_m:null,createElement:()=>fakeEl(),querySelector:k=>k==='.mask'?doc._m:qs(k),querySelectorAll:()=>[],addEventListener(){},body:{style:{},appendChild(e){if(/mask/.test(e.className||'')){e.remove=()=>{if(doc._m===e)doc._m=null};doc._m=e}}},documentElement:{setAttribute(){},removeAttribute(){}}};
const sb={console,Math,Date,JSON,Object,Array,String,Number,Boolean,RegExp,Error,parseInt,parseFloat,isNaN,setTimeout,clearTimeout,Blob:class{},URL:{createObjectURL(){return''},revokeObjectURL(){}},FileReader:class{},localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}},document:doc,window:{scrollTo(){},addEventListener(){},innerWidth:1000,innerHeight:800},confirm:()=>true,alert:()=>{}};
sb.globalThis=sb; vm.createContext(sb);
vm.runInContext(code.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,''), sb);

let pass=0, fail=0;
const t=(name, ok, extra)=>{ if(ok){pass++;console.log("  ✅ "+name+(extra?"  → "+extra:""));} else {fail++;console.log("  ❌ "+name+(extra?"  → "+extra:""));} };
const run = e => vm.runInContext(e, sb);
const TASKS = `ST.tasks=[{id:"a",name:"语文",subject:"cn",type:"daily",emoji:"📖"},
                        {id:"b",name:"数学",subject:"math",type:"daily",emoji:"🔢"}];`;
const FRESH = `ST=defaultState(); ${TASKS} ST.records={}; ST.ledger={}; ST.vault=[]; ST.bossDefeats={};
  ST.bonusMerit=0; ST.draws=0; ST.pity={sinceLegend:0}; ST.createdAt=addD(TODAY(),-30);`;

console.log("\n=== 军功漏洞审计 ===\n");

// 1. 反复改同一天的记录
t("反复切换同一天的战况，军功不变", (()=>{
  run(`${FRESH}`);
  run(`setRec(TODAY(),"a",1,"full",10); setRec(TODAY(),"b",1,"full",10);`);
  const a = run(`availMerit()`);
  for(let i=0;i<30;i++) run(`setRec(TODAY(),"a",1,"full",10); setRec(TODAY(),"b",1,"full",10);`);
  const b = run(`availMerit()`);
  return a===b && a>0;
})(), "反复 30 次后 " + run(`availMerit()`));

// 2. 反复开启/关闭同一个记录
t("开完再关、再开，不产生额外军功", (()=>{
  run(`${FRESH}`);
  run(`setRec(TODAY(),"a",1,"full",10);`);
  const a=run(`availMerit()`);
  for(let i=0;i<20;i++){
    run(`setRec(TODAY(),"a",null,null,0);`);
    run(`setRec(TODAY(),"a",1,"full",10);`);
  }
  return run(`availMerit()`)===a;
})(), "20 次开关后 " + run(`availMerit()`));

// 3. 同一锦囊重复开启
t("★ 同一个锦囊不能被重复开启", (()=>{
  run(`${FRESH}`);
  run(`ST.vault=[{uid:"v1",name:"小零食",emoji:"🍬",tier:"common",merit:10,redeemed:false,gotAt:TODAY(),from:"draw"}];`);
  run(`ST.records={};`);
  // 先给足军功
  for(let i=1;i<=5;i++) run(`setRec(addD(TODAY(),-${i}),"a",1,"full",10); setRec(addD(TODAY(),-${i}),"b",1,"full",10);`);
  run(`redeem("v1");`);
  const spent1 = run(`spentMerit()`), coupons1 = run(`ST.coupons.length`);
  run(`redeem("v1");`);
  run(`redeem("v1");`);
  return spent1===10 && coupons1===1 && run(`spentMerit()`)===spent1 && run(`ST.coupons.length`)===coupons1;
})(), "开启 3 次 → 只扣一次 " + run(`spentMerit()`) + " / " + run(`ST.coupons.length`) + " 张券");

// 4. 渲染多次（幂等性）
t("反复渲染不改变军功", (()=>{
  run(`${FRESH}`);
  run(`setRec(TODAY(),"a",1,"full",10); setRec(TODAY(),"b",1,"full",10);`);
  const a=run(`availMerit()`);
  for(let i=0;i<10;i++) run(`render(); viewToday(); viewStats(); viewReport();`);
  return run(`availMerit()`)===a;
})());

// 5. 结算多次（幂等性）
t("反复结算不重复计账", (()=>{
  run(`${FRESH}`);
  run(`setRec(addD(TODAY(),-10),"a",1,"full",10); setRec(addD(TODAY(),-10),"b",1,"full",10);`);
  run(`settleLedger();`);
  const a=run(`earnedMerit()`);
  for(let i=0;i<10;i++) run(`settleLedger();`);
  return run(`earnedMerit()`)===a;
})(), "结算 10 次后 " + run(`earnedMerit()`));

// 6. 招贤令不会自己变多
t("反复渲染/结算，招贤令不增长", (()=>{
  run(`${FRESH}`);
  run(`setRec(addD(TODAY(),-10),"a",1,"full",10); setRec(addD(TODAY(),-10),"b",1,"full",10);`);
  run(`settleLedger();`);
  const a=run(`ticketsAvail()`);
  for(let i=0;i<10;i++){ run(`render(); settleLedger();`); }
  return run(`ticketsAvail()`)===a;
})(), "稳定在 " + run(`ticketsAvail()`) + " 枚");

// 7. 补录同一天反复
t("同一天反复补录不叠加军功", (()=>{
  run(`${FRESH}`);
  run(`setRec(addD(TODAY(),-2),"a",1,"full",10); setRec(addD(TODAY(),-2),"b",1,"full",10);`);
  const a=run(`availMerit()`);
  for(let i=0;i<20;i++) run(`setRec(addD(TODAY(),-2),"a",1,"full",10); setRec(addD(TODAY(),-2),"b",1,"full",10);`);
  return run(`availMerit()`)===a;
})());

// 8. 破敌不能重复刷
t("同一天不能重复破敌", (()=>{
  run(`${FRESH}`);
  run(`setRec(TODAY(),"a",1,"full",10); setRec(TODAY(),"b",1,"full",10);`);
  run(`attackBoss();`);
  const tk=run(`ticketsAvail()`), vault=run(`ST.vault.length`);
  for(let i=0;i<10;i++) run(`attackBoss();`);
  return run(`ticketsAvail()`)===tk && run(`ST.vault.length`)===vault;
})(), "刷 10 次后仍是 " + run(`ticketsAvail()`) + " 枚 / " + run(`ST.vault.length`) + " 个锦囊");

// 9. 未完成不能破敌
t("军令未了不能出战", (()=>{
  run(`${FRESH}`);
  run(`setRec(TODAY(),"a",0.5,"half",5);`);
  const tk=run(`ticketsAvail()`);
  run(`attackBoss();`);
  return run(`ticketsAvail()`)===tk && run(`Object.keys(ST.bossDefeats).length`)===0;
})());

// 10. 账本与实时窗口不重叠
t("冻结日与补录窗口不重复计账", (()=>{
  run(`${FRESH}`);
  run(`setRec(addD(TODAY(),-10),"a",1,"full",10); setRec(addD(TODAY(),-10),"b",1,"full",10);`);
  run(`settleLedger();`);
  const settled = run(`earnedMerit()`);
  const ledger  = run(`ledgerMerit()`);
  return settled===ledger;   // 冻结后 earnedMerit 应完全来自账本
})(), "earnedMerit " + run(`earnedMerit()`) + " == ledgerMerit " + run(`ledgerMerit()`));

// 11. 可用军功永不超过累计
t("可用军功 ≤ 累计军功（始终）", (()=>{
  run(`${FRESH}`);
  run(`ST.vault=[{uid:"v1",name:"x",emoji:"🎁",tier:"common",merit:5,redeemed:true,gotAt:TODAY(),from:"draw"}];`);
  for(let i=1;i<=6;i++) run(`setRec(addD(TODAY(),-${i}),"a",1,"full",10); setRec(addD(TODAY(),-${i}),"b",1,"full",10);`);
  return run(`availMerit()`) <= run(`totalMerit()`);
})(), "可用 " + run(`availMerit()`) + " / 累计 " + run(`totalMerit()`));

// 12. 重复武将折算是唯一的口子，且每次都要花招贤令
t("重复武将折算军功，每次都花掉一枚招贤令", (()=>{
  run(`${FRESH}`);
  run(`ST.heroes={"吕布":TODAY()}; ST.heroCount={}; ST.vault=[];`);
  // 造 5 枚令，必须经过生产入口 drawOnce，不能手工扣令替实现背书。
  for(let i=1;i<=5;i++) run(`setRec(addD(TODAY(),-${i}),"a",1,"full",10); setRec(addD(TODAY(),-${i}),"b",1,"full",10);`);
  const tk0=run(`ticketsAvail()`);
  run(`drawOnce();`);
  const tk1=run(`ticketsAvail()`);
  return tk1===tk0-1;
})(), "令 " + run(`ticketsAvail()`) + " 枚");

console.log("\n=== 金额边界与正式使用入口 ===");
t("负数锦囊不能反向增加余额", (()=>{
  run(`${FRESH} ST.bonusMerit=20; ST.vault=[{uid:"negative",name:"错误门槛",tier:"common",merit:-1000,redeemed:false}];`);
  run(`redeem("negative");`);
  return !run(`ST.vault[0].redeemed`) && run(`availMerit()`)<=20;
})());
t("字符串记录按数字相加而不是拼接", (()=>{
  run(`${FRESH} ST.records[TODAY()]={a:{level:"1"},b:{level:"1"}};`);
  return run(`dayStars(TODAY())`)===6; // 新规每项完胜 3 星
})());
t("字符串支出按数字相加而不是拼接", (()=>{
  run(`${FRESH} ST.vault=[{merit:"40",redeemed:true},{merit:"50",redeemed:true}];`);
  return run(`spentMerit()`)===90;
})());
t("补发调试入口不能退还已经消费的招贤令", (()=>{
  run(`${FRESH} setRec(TODAY(),"a",1,"full",10); setRec(TODAY(),"b",1,"full",10); ST.draws=1;`);
  const before=run(`ticketsAvail()`);
  run(`grantTickets(3);`);
  return run(`ticketsAvail()`)===before && run(`ST.draws`)===1;
})());
t("正式存档不能被示例数据覆盖", (()=>{
  run(`${FRESH} setRec(TODAY(),"a",1,"full",10);`);
  const before=run(`JSON.stringify(ST)`);
  run(`seedDemo();`);
  return run(`JSON.stringify(ST)`)===before;
})());
t("首次加载无schema旧档会执行迁移且不重复补偿", (()=>{
  run(`${FRESH} ST.heroes={"黄忠":"2026-10-01"}; delete ST.schema; localStorage.setItem(KEY,JSON.stringify(ST)); ST=load();`);
  if(!run(`ST && ST.bonusMerit===60 && !ST.heroes["黄忠"]`)) return false;
  run(`save(); ST=load();`);
  return run(`ST.bonusMerit`)===60;
})());
console.log(`\n  审计结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail?1:0);
