// 家长密码 + 孩子自己加军令（待批准）+ 改动留痕 —— 真实 DOM 点击
const path=require("path"),fs=require("fs");const {JSDOM,VirtualConsole}=require("jsdom");
const ROOT=path.join(__dirname,"..","..");
const html=fs.readFileSync(path.join(ROOT,"少年主公.html"),"utf8");
const errors=[];const vc=new VirtualConsole();vc.on("jsdomError",e=>{const m=String(e.message||e);if(!/Not implemented/.test(m))errors.push(m);});
let pass=0,fail=0;const t=(n,ok,x)=>{if(ok){pass++;console.log("  ✅ "+n);}else{fail++;console.log("  ❌ "+n+(x!==undefined?"  → "+x:""));}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const gh=(html.match(/const GATE_HASH = "([0-9a-f]*)"/)||[])[1];
  const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){ w.scrollTo=()=>{}; w.confirm=()=>true; w.alert=()=>{}; if(gh) w.localStorage.setItem("shaozhu_gate",gh); }});
  const w=dom.window,d=w.document,ev=c=>w.eval(c),q=s=>d.querySelector(s),txt=s=>(q(s)?q(s).textContent:"");
  await sleep(450); ev("closeSheet()");
  const tab=v=>d.querySelector(`#tabs button[data-view="${v}"]`).click();
  const btn=(re,root)=>[...(root||d).querySelectorAll("button")].find(b=>re.test(b.textContent));
  const T=ev("TODAY()");
  // 只有一项每日军令的干净存档
  ev(`ST=defaultState(); ST.records={}; ST.ledger={}; ST.bonusMerit=0; ST.vault=[]; ST.coupons=[];
      ST.tasks=[{id:"t1",name:"早读",subject:"cn",type:"daily",emoji:"📖",planMin:15,weekTarget:7,weekdays:[0,1,2,3,4,5,6],timeSlot:"any"}];
      ST.prizes=[{id:"p1",name:"芝麻糕",emoji:"🍬",tier:"common",merit:50,weight:10}]; save(); render();`);

  console.log("=== A. 没设密码时 ===");
  tab("settings");
  t("设置页提醒还没设家长密码", /还没设家长密码/.test(txt("#main")));
  t("没设密码时设置照常能用（老用户不会突然被锁）", /军令管理/.test(txt("#main")));

  console.log("\n=== B. 设密码 ===");
  btn(/设置家长密码/).click(); await sleep(30);
  q("#pin1").value="12"; q("#pin2").value="12"; q("#pinSave").click();
  t("太短的密码不收", !ev("pinSet()"));
  q("#pin1").value="2468"; q("#pin2").value="2469"; q("#pinSave").click();
  t("两次不一样不收", !ev("pinSet()"));
  q("#pin1").value="2468"; q("#pin2").value="2468"; q("#pinSave").click(); await sleep(30);
  t("密码设好", ev("pinSet()"));
  const raw=w.localStorage.getItem("shaozhu_v1");
  t("存档里没有密码明文", !raw.includes('"2468"') && !/:\s*"?2468"?[,}]/.test(raw));
  t("留痕：设置了家长密码", /设置了家长密码/.test(JSON.stringify(ev("ST.changeLog"))));

  console.log("\n=== C. 锁上后孩子能做什么 ===");
  ev("lockParent()"); tab("settings");
  t("设置页锁住，只显示输密码", /设置要大人来/.test(txt("#main")) && !/军令管理/.test(txt("#main")));
  ev("openTaskEdit('t1')"); await sleep(20);
  t("直接调「改军令」也被拦，弹出密码框", !!q("#pinIn") && !q("#tName"));
  ev("closeSheet()");
  for(const [name,code] of [["删军令","delTask('t1')"],["改锦囊","openPrizeEdit('p1')"],["删锦囊","delPrize('p1')"],["换模板","applyPrizePreset('学习向')"],["清空数据","resetAll()"],["休整期","openBreakEdit()"]]){
    ev(code); await sleep(10);
    t("锁着时「"+name+"」弹密码框", !!q("#pinIn")); ev("closeSheet()");
  }
  t("被拦之后军令和锦囊都没变", ev("ST.tasks.length")===1 && ev("ST.prizes[0].name")==="芝麻糕");

  console.log("\n=== D. 输错 / 输对 ===");
  ev("openTaskEdit('t1')"); await sleep(10);
  q("#pinIn").value="1111"; q("#pinOk").click(); await sleep(10);
  t("输错不放行", !q("#tName") && !ev("parentUnlocked()"));
  q("#pinIn").value="2468"; q("#pinOk").click(); await sleep(30);
  t("输对后直接打开刚才要改的那项", !!q("#tName") && q("#tName").value==="早读");
  q("#tMin").value="25"; q("#tOk").click(); await sleep(20);
  t("改动生效", ev("ST.tasks[0].planMin")===25);
  t("留痕写清改了什么：计划分钟 15→25", /计划分钟 15→25/.test(JSON.stringify(ev("ST.changeLog"))));
  ev("openPrizeEdit('p1')"); await sleep(10);
  t("解锁后 5 分钟内不再重复问密码", !!q("#pName")); ev("closeSheet()");
  d.dispatchEvent(new w.Event("visibilitychange")); // 不在后台，不锁
  Object.defineProperty(d,"hidden",{configurable:true,get:()=>true}); d.dispatchEvent(new w.Event("visibilitychange"));
  Object.defineProperty(d,"hidden",{configurable:true,get:()=>false});
  t("切到后台就锁上", !ev("parentUnlocked()"));

  console.log("\n=== E. 连续输错锁定 ===");
  for(let i=0;i<5;i++) ev("checkPin('0000')");
  t("连错 5 次锁 5 分钟", ev("pinLockLeft()")>0);
  t("锁定期间输对也不行", ev("checkPin('2468')")===false);
  ev("ST.pinFails={n:0,until:0}");

  console.log("\n=== F. 孩子自己加军令 ===");
  ev("lockParent()"); tab("today");
  btn(/再给我加一项/).click(); await sleep(20);
  t("孩子不用密码就能打开「再给我加一项」", !!q("#kName"));
  t("弹窗写明要大人批准才算军功", /大人批准/.test(txt(".sheet")));
  q("#kName").value="多读一章三国"; q("#kOk").click(); await sleep(20);
  const kid=ev("ST.tasks.find(x=>x.name==='多读一章三国')");
  t("加上了，状态是待批准", !!kid && kid.pending===true && kid.fromKid===true);
  t("今日页出现「等大人批准」", /等大人批准/.test(txt("#main")) && /多读一章三国/.test(txt("#main")));
  t("待批准的不进今日军令", !ev("tasksForDate(TODAY())").some(x=>x.id===kid.id));
  const m0=ev("totalMerit()");
  ev(`setRec(TODAY(),"${kid.id}",1,"full",20)`);
  t("★ 待批准的做了也不加星", ev("totalMerit()")===m0, m0+" → "+ev("totalMerit()"));
  ev(`setRec(TODAY(),"t1",1,"full",15)`);
  t("★ 待批准的不影响全勤（只做原有军令就算全勤）", ev("dayIsComplete(TODAY())")===true);
  t("留痕：孩子加了军令", /孩子自己加了军令「多读一章三国」/.test(JSON.stringify(ev("ST.changeLog"))));

  console.log("\n=== G. 批准 / 不批 ===");
  btn(/^批准$/).click(); await sleep(10);
  t("点批准要先输密码", !!q("#pinIn") && ev("ST.tasks.find(x=>x.name==='多读一章三国').pending")===true);
  q("#pinIn").value="2468"; q("#pinOk").click(); await sleep(20);
  const k2=ev("ST.tasks.find(x=>x.name==='多读一章三国')");
  t("批准后转正，从今天起算", k2.pending===false && k2.approvedAt===T);
  t("★ 批准当天的点卯开始算星", ev("totalMerit()")>m0);
  t("留痕：批准了", /批准了孩子自己加的军令/.test(JSON.stringify(ev("ST.changeLog"))));
  // 批准前的旧日子不倒算
  const y=ev("addD(TODAY(),-1)");
  ev(`setRec("${y}","${kid.id}",1,"full",20)`);
  t("★ 批准之前那天的点卯不倒算星", ev(`dayStars("${y}")`)===0);
  ev(`ST.tasks.push({id:"k9",name:"玩平板学英语",subject:"en",type:"flex",weekTarget:7,weekdays:[0,1,2,3,4,5,6],fromKid:true,pending:true,addedAt:TODAY()}); setRec(TODAY(),"k9",1,"full",30); save(); render();`);
  const m1=ev("totalMerit()");
  ev("rejectTask('k9')"); await sleep(10);
  t("不批：任务和它的点卯一起拿掉", !ev("ST.tasks.some(x=>x.id==='k9')") && !ev("rec(TODAY(),'k9')"));
  t("★ 不批不扣已有的星", ev("totalMerit()")===m1);

  console.log("\n=== H. 兑现、导入、锦囊匣都要家长 ===");
  ev(`ST.coupons=[{id:"c1",name:"芝麻糕",emoji:"🍬",tier:"common",merit:50,openedAt:TODAY(),status:"pending",doneAt:"",note:""}]; lockParent(); save();`);
  ev("openCouponSettle('c1')"); await sleep(10);
  t("确认兑现要密码", !!q("#pinIn")); ev("closeSheet()");
  ev("settleCoupon('c1','')");
  t("留痕：确认兑现", /确认兑现「芝麻糕」/.test(JSON.stringify(ev("ST.changeLog"))));
  ev("pickImport()"); await sleep(10);
  t("导入备份要密码", !!q("#pinIn")); ev("closeSheet()");
  ev(`ST.vault=[{uid:"v1",name:"芝麻糕",emoji:"🍬",tier:"common",merit:50,redeemed:false,gotAt:TODAY()}]; save();`);
  ev("openVaultEdit('v1')"); await sleep(10);
  t("改锦囊匣门槛要密码", !!q("#pinIn") && !q("#vMerit")); ev("closeSheet()");

  console.log("\n=== I. 军报留痕与忘记密码 ===");
  tab("report");
  t("军报里能看到改动记录", /改动记录/.test(txt("#main")) && /批准了孩子自己加的军令/.test(txt("#main")));
  ev("forgotPin()");
  t("忘记密码可以清掉", !ev("pinSet()") && ev("ST.pinResetAt")===T);
  t("清掉也留痕", /被「忘记密码」清除/.test(JSON.stringify(ev("ST.changeLog"))));
  tab("settings");
  t("设置页挂出「密码被清除过」", /被「忘记密码」清除过/.test(txt("#main")));

  console.log("\n=== J. 老存档升级 ===");
  const old=JSON.parse(raw); old.schema=8; delete old.parentPin; delete old.changeLog; old.bonusMerit=1585;
  const up=ev(`prepareState(${JSON.stringify(old)})`);
  t("v8 存档升到 v9，星星一颗不少", up.schema===9 && up.bonusMerit===1585 && Array.isArray(up.changeLog) && up.parentPin===null);
  t("老存档的已有军令都不会变成待批准", up.tasks.every(x=>!x.pending));

  t("全程无未捕获异常", errors.length===0, errors.slice(0,2).join(" | "));
  console.log(`\n  家长锁测试：${pass} 通过 / ${fail} 失败`); process.exit(fail?1:0);
})();
