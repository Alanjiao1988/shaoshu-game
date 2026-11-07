/* 设置包「孩子名字核对」（v2.6.1）。用法：NODE_PATH=<workspace>/node_modules node .workbuddy/tests/pack_name.js */
const path=require("path"),fs=require("fs");const {JSDOM,VirtualConsole}=require("jsdom");
const html=fs.readFileSync(path.join(__dirname,"..","..","少年主公.html"),"utf8");
const vc=new VirtualConsole();const errors=[];vc.on("jsdomError",e=>{const m=String(e.message||e);if(/Not implemented|Could not parse CSS|getContext/.test(m))return;errors.push(m);});
const make=()=>new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/",pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.scrollTo=()=>{};const gh=(html.match(/const GATE_HASH = "([0-9a-f]*)"/)||[])[1];if(gh)w.localStorage.setItem("shaozhu_gate",gh);w.confirm=()=>true;w.alert=()=>{};}});
let pass=0,fail=0;const t=(n,ok,x)=>{if(ok){pass++;console.log("  ✅ "+n);}else{fail++;console.log("  ❌ "+n+(x!==undefined?"  → "+x:""));}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const P=make(),Q=make();await sleep(450);const p=P.window,q=Q.window;
  for(const w of [p,q]){w.eval("closeSheet();PARENT_UNTIL=1e15");}
  p.eval('ST.childName="大宝"'); q.eval('ST.childName="小宝"');
  const btn=(w,re)=>[...w.document.querySelectorAll("button")].find(x=>re.test(x.textContent));
  const sheetTxt=w=>(w.document.querySelector(".sheet")||{textContent:""}).textContent;
  console.log("=== 生成 ===");
  p.eval("VIEW='settings';render()"); btn(p,/^生成$/).click();
  t("生成面板默认填本机孩子名", p.document.querySelector("#pkFor").value==="大宝");
  const forVal=v=>{const i=p.document.querySelector("#pkFor");i.value=v;i.dispatchEvent(new p.Event("input"));return p.document.querySelector("#pkOut").value;};
  const codeBig=forVal("大宝"), codeSmall=forVal("小宝");
  t("改“给谁”后包随之变化", codeBig!==codeSmall && codeSmall.startsWith("SZPK1:"));
  const dec=c=>JSON.parse(Buffer.from(c.slice(6,c.lastIndexOf(".")),"base64").toString("utf8"));
  t("包里写着名字", dec(codeBig).for==="大宝" && dec(codeSmall).for==="小宝");
  console.log("=== 导入 ===");
  const imp=(w,code)=>{w.eval("closeSheet();VIEW='settings';render()");btn(w,/^导入$/).click();w.document.querySelector("#pkIn").value=code;btn(w,/看看会改什么/).click();};
  imp(q,codeSmall);
  t("名字一致：无警告，按钮是「确认应用」", !/可能发错人/.test(sheetTxt(q)) && !!btn(q,/^确认应用$/));
  p.eval('ST.prizes.find(x=>x.name==="一支新笔").merit=77');
  const forBig=(()=>{p.eval("closeSheet()");p.eval("VIEW='settings';render()");btn(p,/^生成$/).click();return forVal("大宝");})();
  imp(q,forBig);
  t("名字不符：出现发错人警告", /可能发错人/.test(sheetTxt(q)) && /大宝/.test(sheetTxt(q)) && /小宝/.test(sheetTxt(q)));
  t("按钮变成「仍然应用」", !!btn(q,/^仍然应用$/) && !btn(q,/^确认应用$/));
  t("不确认就不改", q.eval(`ST.prizes.find(x=>x.name==="一支新笔").merit`)!==77);
  btn(q,/^不改$/).click();
  imp(q,forBig); btn(q,/^仍然应用$/).click();
  t("家长仍确认后可应用", q.eval(`ST.prizes.find(x=>x.name==="一支新笔").merit`)===77);
  t("军报记下名字不符", q.eval(`ST.changeLog.some(x=>/大宝/.test(x.what)&&/不符/.test(x.what))`));
  console.log("=== 兼容 ===");
  const old=(()=>{ // 2.6.0 的包：没有 for 字段
    const k=p.eval("familyPin().h");const body=JSON.stringify({at:Date.now()+5e6,tasks:[{n:"甲",e:"",s:"cn",y:"daily",m:10,w:5,d:[1],o:"any",b:0}],prizes:[]});
    let h=2166136261;const s=k+"|"+body+"|"+k;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
    return "SZPK1:"+Buffer.from(body).toString("base64")+"."+h.toString(36);})();
  imp(q,old);
  t("旧版包（无名字）能导入、不报警", /要改这些/.test(sheetTxt(q)) && !/可能发错人/.test(sheetTxt(q)));
  t("名字含 HTML 被转义", (()=>{q.eval("closeSheet()");q.eval('ST.childName="<b>x</b>"');imp(q,codeSmall);return !q.document.querySelector(".sheet b.x") && !/<b>x<\/b>/.test(q.document.querySelector(".sheet").innerHTML.replace(/&lt;b&gt;/g,""));})());
  t("没有页面报错", errors.length===0, errors.slice(0,2).join("|"));
  console.log(`\n设置包名字核对：${pass} 通过 / ${fail} 失败`);process.exit(fail?1:0);
})();
