/* 普通保存失败与按日显示回归：仅隔离合成记录。 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {JSDOM,VirtualConsole}=require("jsdom");
const html=fs.readFileSync(path.resolve(__dirname,"../../少年主公.html"),"utf8");
let pass=0;
function make(){
 const messages=[],dom=new JSDOM(html,{url:"https://local.test/",runScripts:"dangerously",virtualConsole:new VirtualConsole(),beforeParse(w){
  w.scrollTo=()=>{};w.confirm=()=>true;w.setTimeout=()=>0;w.clearTimeout=()=>{};w.localStorage.setItem("shaozhu_gate",html.match(/const GATE_HASH = "([^"]*)"/)[1]);
 }}),w=dom.window;
 w.__messages=messages;w.eval('closeSheet();PARENT_UNTIL=1e15;toast=s=>window.__messages.push(s);');
 return {w,e:s=>w.eval(s),q:s=>w.document.querySelector(s),messages,close:()=>w.close(),fault(){const p=w.Storage.prototype,o=p.setItem;p.setItem=function(k,v){if(k==="shaozhu_v1")throw new Error("quota");return o.call(this,k,v)};return ()=>p.setItem=o;}};
}
function test(name,fn){const c=make();try{fn(c);pass++;console.log("通过 "+name);}finally{c.close();}}
function failure(c,action){c.e("save()");const raw=c.w.localStorage.getItem("shaozhu_v1"),before=c.e("JSON.stringify(ST)");c.messages.length=0;const undo=c.fault();try{action();}finally{undo();}assert.equal(c.w.localStorage.getItem("shaozhu_v1"),raw);assert.equal(c.e("JSON.stringify(ST)"),before);assert.ok(c.messages.some(s=>/没有保存/.test(s)));assert.ok(!c.messages.some(s=>/已恢复|兑现完成|已提交|军报已存|已标记/.test(s)));}
try{
 test("恢复出厂写失败不先删除原记录且日记保留",c=>{c.e('ST.records[TODAY()]={};localStorage.setItem(DIARY_KEY,JSON.stringify({entries:{"2026-01-01":{text:"keep"}}}))');const diary=c.w.localStorage.getItem("shaozhu_diary");failure(c,()=>c.e("resetAll()"));assert.equal(c.w.localStorage.getItem("shaozhu_diary"),diary);});
 test("兑现确认写失败不报告兑现完成",c=>{c.e('ST.coupons=[{id:"coupon",name:"奖励",tier:"common",status:"pending",openedAt:TODAY()}]');failure(c,()=>c.e('settleCoupon("coupon","test")'));});
 test("孩子提交新任务写失败保留输入而不报告成功",c=>{c.e("openKidAdd()");c.q("#kName").value="new task";failure(c,()=>c.q("#kOk").click());assert.equal(c.q("#kName").value,"new task");});
 test("心愿标记写失败不报告成功",c=>{c.e('ST.vault=[{uid:"wish",name:"奖励",tier:"common",merit:10,redeemed:false}]');failure(c,()=>c.e('markWish("wish")'));});
 for(const mode of ["归档","改名换营","新增"]){
  test(mode+"明天生效时四营与军报不提前采用新配置",c=>{
   c.e('ST=defaultState();ST.tasks=[{id:"a",name:"旧军令",subject:"cn",type:"daily",planMin:10,weekTarget:7,weekdays:[0,1,2,3,4,5,6],timeSlot:"any",archived:false}];ST.createdAt=weekStart(TODAY());for(const date of weekDates(TODAY()))if(date<=TODAY())setRec(date,"a",1,"full",10);save();VIEW_DATE=TODAY();');
   const before=c.e("earnedMerit()"),beforeToday=c.e("viewToday()"),beforeReport=c.e("viewReport()");
   if(mode==="归档")c.e('changeTaskRules(()=>ST.tasks[0].archived=true)');
   else if(mode==="改名换营")c.e('changeTaskRules(()=>{ST.tasks[0].name="明日新名";ST.tasks[0].subject="math"})');
   else c.e('changeTaskRules(()=>ST.tasks.push({...ST.tasks[0],id:"b",name:"明日新增",subject:"math",approvedAt:addD(TODAY(),1)}))');
   const today=c.e("viewToday()"),report=c.e("viewReport()");
   const zones=s=>s.slice(s.indexOf('<div class="zones">'),s.indexOf('</div></div>',s.indexOf('<div class="zones">')));
   assert.equal(zones(today),zones(beforeToday));
   const rows=report.slice(report.indexOf("各项军令达成情况"),report.indexOf("复盘之要"));
   assert.ok(rows.includes("旧军令"));assert.ok(!rows.includes("明日新名"));assert.ok(!rows.includes("明日新增"));
   assert.equal(c.e("earnedMerit()"),before);
  });
 }
 console.log(`动作与按日显示：${pass} 通过 / 0 失败`);
}catch(e){console.error(e);process.exitCode=1;}
