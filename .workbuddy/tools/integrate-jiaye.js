"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"../.."),target=path.join(root,"site","index.html"),desktop=path.join(root,"少年主公.html");
const gameFile=process.argv[2];if(!gameFile)throw new Error("Pass the verified offline game HTML absolute path or --current.");
let page=fs.readFileSync(desktop,"utf8"),game;
if(gameFile==="--current"){
  const match=page.match(/<template id="jiaye-payload"[^>]*>([\s\S]*?)<\/template>/);
  assert.ok(match,"Embedded game is missing");game=Buffer.from(match[1].trim(),"base64").toString("utf8");
}else game=fs.readFileSync(gameFile,"utf8");
assert.ok(game.startsWith("<!DOCTYPE html>"));
assert.ok(game.includes('family-shop-child-v7')||game.includes('shaozhu_jiaye_child_v7'));
// No new URL exposes the game. It is an inert template until the existing gate and init allow mounting.
// This is UI/namespace isolation, not a claim of server authorization or hostile-code isolation.
const guard=`<script>(function(){"use strict";let allowed=false;try{const sameOrigin=parent.location.protocol==="file:"?true:parent.location.origin===window.origin;allowed=parent!==window&&sameOrigin&&parent.document.getElementById("jiaye-frame")?.contentWindow===window&&parent.gatePassed()&&!parent.document.getElementById("gate");}catch(e){}if(!allowed){window.stop();document.documentElement.replaceChildren();throw new Error("Family entry required");}})();</script>`;
if(game.includes("Family entry required"))game=game.replace(/<script>\(function\(\)\{"use strict";let allowed=false;[\s\S]*?throw new Error\("Family entry required"\);\}\}\)\(\);<\/script>/,()=>guard);
else game=game.replace("<head>","<head>"+guard);
game=game.replaceAll("family-shop-child-v7","shaozhu_jiaye_child_v7");
const returnBar=`<nav class="study-return"><button id="return-to-study" type="button">返回军令台</button><span>游戏铜钱不兑换学习军功</span></nav>`;
const style=`<style>.study-return{display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:1450px;margin:0 auto 12px;color:#496041;font-size:14px}.study-return button{min-height:44px;background:#f8f2e3;border:1px solid #9aaf89;border-radius:5px;color:#385b49;padding:8px 15px;font:inherit;cursor:pointer}.study-return span{text-align:right;font-size:13px}@media(max-width:600px){.study-return span{font-size:11px;max-width:53%}}</style>`;
if(!game.includes('.study-return{'))game=game.replace("</head>",style+"</head>");
// Keep the shopkeeper independent from the original background and all live stock, and use verified WebP assets for fast iPad loading.
const webpMeta=JSON.parse(fs.readFileSync(path.join(root,".workbuddy","ref","jiaye-webp-assets.json"),"utf8"));
function loadWebpDataURI(key){
  const item=webpMeta[key];assert.ok(item,"Missing webp meta "+key);
  const bytes=fs.readFileSync(path.join(root,".workbuddy","ref",item.file));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),item.sha256,"WebP asset fingerprint mismatch: "+key);
  return `data:image/webp;base64,${bytes.toString("base64")}`;
}
const figure=`<img id="jiaye-shopkeeper" class="shopkeeper-art" src="${loadWebpDataURI("shopkeeper")}" alt="青衣少年掌柜站在木柜台后照看生意" draggable="false" decoding="async" data-art-version="2">`;
game=game.replace(/<img\b[^>]*\bid="jiaye-shopkeeper"[^>]*>/g,"");
let placed=false;
game=game.replace(/<img class="scene-background" src="data:image\/[^"]+"([^>]*)>/,(_,rest)=>{placed=true;return `<img class="scene-background" src="${loadWebpDataURI("scene-bg")}"${rest}>`+figure;});
assert.ok(placed,"Original shop background is missing");
// Counter UI: remove customer art at source, not merely hide it with CSS.
for(const fragment of ['<div id="bubble" class="bubble" hidden></div>','<div id="customer-zone" class="customer-zone"></div>'])game=game.replace(fragment,"");
game=game.replace(/<p class="footnote art-note">[\s\S]*?<\/p>/,'<p class="footnote art-note">少年掌柜照看小铺；不渲染顾客人物，来客需求用文字呈现，货架随真实库存变化。</p>');
const counterSource=fs.readFileSync(path.join(root,".workbuddy","ref","jiaye-counter.js"),"utf8");
const gameScripts=[...game.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];assert.equal(gameScripts.length,6);
let view=gameScripts[4][1];
assert.ok(view.includes("function renderScene(")&&view.includes("function toast("));
view=view.replace(/const ART=\{bread:"data:image\/[^"]+",rope:"data:image\/[^"]+",fan:"data:image\/[^"]+"(?:,customer:[^}]+)?\};/,()=>`const ART={bread:"${loadWebpDataURI("bread")}",rope:"${loadWebpDataURI("rope")}",fan:"${loadWebpDataURI("fan")}"};`);
view=view.replace('${button("读给我听","speak",false,"quiet full")}',"");
view=view.replace(/let sceneQuantities=null(?:,lastGuestKey="")?;[\s\S]*?function toast\(/,()=>"let sceneQuantities=null;\n"+counterSource+"\nfunction toast(");
view=view.replace(/else if\(state.phase==="receipt"\)\{[\s\S]*?\nelse if\(\["summary","finished"\]/,'else if(state.phase==="receipt"){html=counterReceiptHTML();}\nelse if(["summary","finished"]');
view=view.replace(/else if\(\["summary","finished"\]\.includes\(state\.phase\)\)\{html=[\s\S]*?\}\nelse if\(!c&&state\.phase==="open"\)/,'else if(["summary","finished"].includes(state.phase)){html=counterSummaryCardHTML();}\nelse if(!c&&state.phase==="open")');
view=view.replace(/else if\(c\)\{[\s\S]*?\nelse\{html=/,'else if(c){html=counterSaleHTML(c);}\nelse{html=');
view=view.replace('function act(name,node){const d=node.dataset;','function act(name,node){const d=node.dataset;if(name==="saleqty"){changeCounterQuantity(Number(d.delta));return;}');
// Collapse the injected quantity handler on rebuild to keep builds byte-idempotent.
view=view.replace(/(if\(name==="saleqty"\)\{changeCounterQuantity\(Number\(d.delta\)\);return;\}){2,}/g,'if(name==="saleqty"){changeCounterQuantity(Number(d.delta));return;}');
const tradeHandler=`if(name==="trade"){const c=E.current(state),n=Number(d.quantity),tutorial=state.day===1&&state.cursor===0;if(state.phase!=="open"||!c||d.id!==c.id||d.item!==c.item||tutorial&&selected!==d.item)return;const p=E.PRODUCTS[d.item];if(!Number.isInteger(n)||n<1||n>Math.min(E.qty(state,d.item),c.count)||state.prices[d.item]>c.budget)return;const sell=()=>{receiptGuardUntil=performance.now()+650;dispatch({type:"trade",id:c.id,item:p.id,quantity:n});};if(tutorial)confirm("确认第一笔交换",\`交\${n}\${p.unit}\${p.name}，收\${n*state.prices[d.item]}钱。\\n取消不会扣货或收款。\`,sell,"交货并收款");else sell();return;}\n`;
view=view.replace(/if\(name==="trade"\)\{[\s\S]*?\nif\(name==="pass"\)/,()=>tradeHandler+'if(name==="pass")');
assert.ok(!/customer-art|customer-placeholder|customer-zone|visitor-card|\$\("bubble"\)/.test(view),"Customer visuals remain in view source");
const originalStorage='setItem:(k,v)=>window.localStorage.setItem(k,v)';
const guardedStorage='setItem:(k,v)=>{if(window.localStorage.getItem("shaozhu_v1_import_tx")!==null)throw new Error("完整备份正在恢复，请稍后重新进入店铺");window.localStorage.setItem(k,v);}';
if(!view.includes("完整备份正在恢复，请稍后重新进入店铺"))view=view.replace(originalStorage,guardedStorage);
new vm.Script(view);game=game.replace(gameScripts[4][0],()=>"<script>"+view+"</script>");
const codec=`/* BUILD:JIAYE_CODEC */\nconst JIAYE_CODEC=Object.freeze({engine:(function(){const module={exports:{}};${gameScripts[1][1]};return module.exports;})(),save:(function(){const module={exports:{}};${gameScripts[2][1]};return module.exports;})()});\n/* END:JIAYE_CODEC */`;
assert.ok(page.includes('/* BUILD:JIAYE_CODEC */'),"Full backup codec marker missing");
page=page.replace(/\/\* BUILD:JIAYE_CODEC \*\/[\s\S]*?\/\* END:JIAYE_CODEC \*\//,()=>codec);
const themeFile=path.join(root,".workbuddy","ref","jiaye-theme.css");
const theme=`<style id="shaozhu-jiaye-theme">${fs.readFileSync(themeFile,"utf8")}</style>`;
game=game.replace(/<style id="shaozhu-jiaye-theme">[\s\S]*?<\/style>\s*/g,"");
game=game.replace("</head>",theme+"</head>");
const bridge=`<script>(function(){"use strict";document.body.classList.add("embedded");const send=type=>parent.postMessage({module:"shaozhu-jiaye-v1",type},parent.location.protocol==="file:"?"*":parent.location.origin);document.getElementById("return-to-study").onclick=()=>{try{speechSynthesis.cancel();}catch(e){}send("return");};send("ready");})();</script>`;
if(!game.includes('id="return-to-study"'))game=game.replace("</body>",returnBar+bridge+"</body>");
else{const parts=[...game.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];assert.equal(parts.length,6);assert.ok(parts[5][1].includes('send("ready")'));game=game.replace(parts[5][0],()=>bridge);}
let n=0;for(const m of game.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){new vm.Script(m[1]);n++;}assert.equal(n,6);
const hash=crypto.createHash("sha256").update(game).digest("hex"),payload=Buffer.from(game,"utf8").toString("base64");
const template=`<template id="jiaye-payload" data-build="${hash}" data-module-version="child-v7">${payload}</template>\n`;
if(page.includes('<template id="jiaye-payload"'))page=page.replace(/<template id="jiaye-payload"[^>]*>[\s\S]*?<\/template>\s*/,()=>template);
else page=page.replace('<script>\n"use strict";',()=>template+'<script>\n"use strict";');
assert.ok(page.includes(template));assert.equal((page.match(/<script>/g)||[]).length,1);
new vm.Script(page.match(/<script>([\s\S]*)<\/script>/)[1]);
// Backups were made before editing. Both historical entry copies intentionally remain identical.
fs.writeFileSync(target,page,"utf8");fs.writeFileSync(desktop,page,"utf8");
console.log("Built integrated study app; inert game bytes",Buffer.byteLength(game),"app bytes",Buffer.byteLength(page),"scripts checked",n+1);
console.log("Module namespace independent; no external game route; study schema and gate unchanged; no deployment performed.");
if(process.argv.includes("--preview")){
  const outputDir=path.join(root,"outputs");assert.ok(fs.statSync(outputDir).isDirectory());
  const scriptBodies=[...game.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  // Preview is an explicitly separate game, never a way around the production gate.
  let preview=game.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g,(all,body)=>body===scriptBodies[0]||body===scriptBodies[5]?"":all);
  const version=page.match(/const APP_VERSION = "([^"]+)";/)[1];
  preview=preview.replaceAll("shaozhu_jiaye_child_v7","shaozhu_jiaye_preview_v"+version.replaceAll(".","")).replaceAll("shaozhu_v1_import_tx","shaozhu_preview_import_tx");
  const banner=`<div class="preview-note" role="note">我的家业 · iPad横屏本地试玩 v${version}｜独立试玩存档，不读取或覆盖正式进度；未发布。</div>`;
  preview=preview.replace("<body>","<body>"+banner).replace("<title>我的杂货店 · 五日分层经营</title>",`<title>少年掌柜 · 独立本地试玩 v${version}</title>`);
  const file=path.join(outputDir,`少年掌柜_本地试玩_v${version}.html`);fs.writeFileSync(file,preview,"utf8");
  assert.ok(!preview.includes("shaozhu_jiaye_child_v7")&&!preview.includes("shaozhu_v1"));
  console.log("Separate preview built:",file);
  // Full-shell preview uses separate names for ALL local keys, including the embedded game.
  const namespace="shaozhu_preview"+version.replaceAll(".","")+"_";
  const sandboxGame=game.replaceAll("shaozhu_",namespace);
  const sandboxHash=crypto.createHash("sha256").update(sandboxGame).digest("hex");
  const sandboxTemplate=`<template id="jiaye-payload" data-build="${sandboxHash}" data-module-version="child-v7">${Buffer.from(sandboxGame,"utf8").toString("base64")}</template>`;
  let full=page.replaceAll("shaozhu_",namespace).replace(/<template id="jiaye-payload"[^>]*>[\s\S]*?<\/template>/,()=>sandboxTemplate);
  full=full.replace(/const GATE_HASH = "[^"]*";/,'const GATE_HASH = "";');
  full=full.replace('  startOfflineProtection();','  // Isolated local preview: no service worker installation.');
  full=full.replace('<h2>我的家业</h2>','<h2>我的家业 · 隔离试玩</h2>');
  full=full.replace('</script>\n</body>', '\nif(ST)ST.lastOpen=TODAY();openJiaye();\n</script>\n</body>');
  assert.ok(!full.includes('"shaozhu_v1"')&&!full.includes('"shaozhu_jiaye_child_v7"'));
  new vm.Script(full.match(/<script>([\s\S]*)<\/script>/)[1]);
  const fullFile=path.join(outputDir,`少年主公_iPad横屏完整试玩_v${version}.html`);fs.writeFileSync(fullFile,full,"utf8");
  console.log("Separate full-shell preview built:",fullFile);
}
