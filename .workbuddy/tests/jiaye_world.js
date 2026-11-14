/* Three-Kingdoms World-Linked Gameplay Tests:
   1. Rumor progression with Sanguo chapter & advisor hints
   2. Morning market bundle deals & merchant discount
   3. Mystery sealed box & 12 relics choice (keep for Lord Pavilion vs sell to merchant)
   4. Continuation beyond Day 5 (Day 6+ seamless progression)
   5. Rank-gated shop upgrades & frontline boss orders
   6. Strict zero merit contamination & full backup preservation */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {JSDOM,VirtualConsole}=require("jsdom");
const root=path.resolve(__dirname,"../..");
const page=fs.readFileSync(path.join(root,"少年主公.html"),"utf8");
const E=require(path.join(root,".workbuddy/ref/jiaye-engine.js"));
const S=require(path.join(root,".workbuddy/ref/jiaye-save.js"));

let pass=0;
function t(name,fn){fn();pass++;console.log("通过 "+name);}

function advanceToDay(s,targetDay){
  if(s.phase==="welcome")s=E.step(s,{type:"begin"});
  while(s.day<targetDay){
    if(s.phase==="prep"||s.phase==="open")s=E.step(s,{type:"close"});
    if(s.phase==="finished")s=E.step(s,{type:"continue_beyond"});
    else if(s.phase==="summary")s=E.step(s,{type:"next"});
  }
  return s;
}

t("第5天结清后可带着全部本钱货架无缝续营进入第6天及更远",()=>{
  let s=E.initial(7);
  s=E.step(s,{type:"begin"});
  s=E.step(s,{type:"ask",id:"d1-rope"});
  s=E.step(s,{type:"buy",item:"rope",quantity:1});
  s=E.step(s,{type:"open"});
  s=E.step(s,{type:"trade",id:"d1-rope",item:"rope",quantity:1});
  s=E.step(s,{type:"continue"});
  s=E.step(s,{type:"close"});
  assert.equal(s.cash,50);
  s=advanceToDay(s,5);
  s=E.step(s,{type:"buy",item:"rope",quantity:2});
  s=E.step(s,{type:"close"});
  assert.equal(s.phase,"finished");
  const cash5=s.cash,rope5=E.qty(s,"rope");
  s=E.step(s,{type:"continue_beyond"});
  assert.equal(s.day,6);
  assert.equal(s.phase,"prep");
  assert.equal(s.cash,cash5);
  assert.equal(E.qty(s,"rope"),rope5);
  s=advanceToDay(s,12);
  assert.equal(s.day,12);
  assert.equal(s.phase,"prep");
});

t("演义回目决定三国风声池，麾下谋士给出真假辨别提示",()=>{
  let early=advanceToDay(E.initial(3),6);
  early=E.step(early,{type:"synclord",chapter:5,rankLevel:1,rankName:"什长",bossIndex:6,ownedCount:2,advisors:["郭嘉"],merchants:[],warriors:[]});
  const pEarly=E.dayPlan(early);
  assert.equal(pEarly.rumor.chapter,5);
  assert.match(pEarly.rumor.advisorHint,/郭嘉/);

  let chibi=advanceToDay(E.initial(3),6);
  chibi=E.step(chibi,{type:"synclord",chapter:49,rankLevel:4,rankName:"校尉",bossIndex:5,ownedCount:8,advisors:["诸葛亮"],merchants:["鲁肃"],warriors:["赵云"]});
  const pChibi=E.dayPlan(chibi);
  assert.equal(pChibi.rumor.chapter,49);
  assert.match(pChibi.rumor.advisorHint,/诸葛亮/);
  assert.notEqual(pEarly.rumor.text,pChibi.rumor.text);
});

t("早市整捆抄底比平价省钱，麾下糜竺/鲁肃可再省1钱且每日限一次",()=>{
  let sNoMerch=advanceToDay(E.initial(12),2);
  const b0=E.dayPlan(sNoMerch).market.bundle;
  assert.ok(b0.cost<b0.normalCost);

  let sWithMerch=E.step(sNoMerch,{type:"synclord",chapter:10,rankLevel:1,rankName:"什长",bossIndex:1,ownedCount:3,advisors:[],merchants:["糜竺"],warriors:[]});
  const b1=E.dayPlan(sWithMerch).market.bundle;
  assert.equal(b1.cost,Math.max(b1.qty,b0.cost-1));
  const cashBefore=sWithMerch.cash;
  sWithMerch=E.step(sWithMerch,{type:"bundle"});
  assert.equal(sWithMerch.cash,cashBefore-b1.cost);
  assert.equal(E.qty(sWithMerch,b1.item),b1.qty);
  assert.throws(()=>E.step(sWithMerch,{type:"bundle"}),/一次/);
});

t("早市封泥木匣开出三国名物后，可选收入藏珍阁或高价卖给富商",()=>{
  // Find a seed where day 2 box is a relic
  let seed=1;
  while(seed<200){
    const s=advanceToDay(E.initial(seed),2);
    if(E.dayPlan(s).market.box.kind==="relic")break;
    seed++;
  }
  let s=advanceToDay(E.initial(seed),2);
  const box=E.dayPlan(s).market.box;
  assert.equal(box.kind,"relic");
  const relic=E.RELIC_MAP[box.relicId];
  s=E.step(s,{type:"mystery"});
  assert.equal(s.pendingRelic,relic.id);
  // Cannot open shop before deciding relic fate
  assert.throws(()=>E.step(s,{type:"open"}),/奇物/);

  // Branch A: Keep in Lord Pavilion
  const kept=E.step(s,{type:"relic_choice",choice:"keep"});
  assert.equal(kept.pendingRelic,null);
  assert.deepEqual(kept.relics,[relic.id]);
  assert.equal(kept.cash,s.cash);

  // Branch B: Sell to merchant for high cash
  const sold=E.step(s,{type:"relic_choice",choice:"sell"});
  assert.equal(sold.pendingRelic,null);
  assert.deepEqual(sold.relics,[]);
  assert.equal(sold.cash,s.cash+relic.sell);
});

t("官职绑定商号晋升：官职不足拦截，达标后用铜钱扩建货架容量",()=>{
  let s=advanceToDay(E.initial(5),2);
  // Default rankLevel 0 (布衣) cannot upgrade to level 1 (needs 什长 rankLevel>=1)
  assert.throws(()=>E.step(s,{type:"upgrade_shop"}),/什长/);
  s=E.step(s,{type:"synclord",chapter:8,rankLevel:1,rankName:"什长",bossIndex:2,ownedCount:4,advisors:[],merchants:[],warriors:["关羽"]});
  const capBefore=E.capacity(s);
  s=E.step(s,{type:"upgrade_shop"});
  assert.equal(s.shopLevel,1);
  assert.equal(E.capacity(s),capBefore+6);
});

t("存档序列化与完整备份兼容新动作，且外层主公藏珍阁只读同步、军功零污染",()=>{
  let s=advanceToDay(E.initial(1),2);
  // Find relic seed & save
  let rSeed=1;while(E.dayPlan(advanceToDay(E.initial(rSeed),2)).market.box.kind!=="relic")rSeed++;
  const actions=[
    {type:"begin"},{type:"close"},{type:"next"},
    {type:"synclord",chapter:38,rankLevel:3,rankName:"军侯",bossIndex:4,ownedCount:6,advisors:["诸葛亮"],merchants:["糜竺"],warriors:["赵云"]},
    {type:"mystery"},{type:"relic_choice",choice:"keep"}
  ];
  let cur=E.initial(rSeed);
  for(const a of actions)cur=E.step(cur,a);
  const raw=S.encode(rSeed,actions,S.DEFAULT_UI,E);
  const restored=S.restore(raw,E);
  assert.equal(restored.state.relics.length,1);
  assert.equal(restored.state.lord.chapter,38);

  // Verify outer 少年主公.html renders 主公藏珍阁 with that relic and merit remains 0
  const htmlOnly=page.replace(/<template id="jiaye-payload"[^>]*>[\s\S]*?<\/template>/,"").replace(/<script>[\s\S]*<\/script>/,"");
  const scriptBody=page.match(/<script>([\s\S]*)<\/script>/)[1].replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,"");
  const dom=new JSDOM(htmlOnly,{url:"https://world.local/",runScripts:"outside-only",virtualConsole:new VirtualConsole()});
  const w=dom.window;
  w.scrollTo=()=>{};w.setTimeout=()=>1;w.clearTimeout=()=>{};
  w.localStorage.setItem("shaozhu_jiaye_child_v7",raw);
  vm.runInContext(scriptBody,dom.getInternalVMContext());
  w.eval('ST=defaultState();ST.heroes["诸葛亮"]="2026-11-14";ST.heroes["糜竺"]="2026-11-14";ST.heroes["赵云"]="2026-11-14";save();');
  const meritBefore=w.eval("availMerit()");
  const ctx=JSON.parse(w.eval("JSON.stringify(jiayeLordContext())"));
  assert.ok(ctx.advisors.includes("诸葛亮"));
  assert.ok(ctx.merchants.includes("糜竺"));
  assert.ok(ctx.warriors.includes("赵云"));
  const heroesView=w.eval("viewHeroes()");
  const relicObj=E.RELIC_MAP[restored.state.relics[0]];
  assert.ok(heroesView.includes("主公藏珍阁"));
  assert.ok(heroesView.includes(relicObj.name));
  assert.ok(heroesView.includes("已收 1 / 12 件"));
  assert.equal(w.eval("availMerit()"),meritBefore);
  dom.window.close();
});

console.log(`三国大世界联动专项：${pass} 通过 / 0 失败`);
