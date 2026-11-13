/* 离线安装状态与完整链接注册：真实 DOM 隔离，无浏览器/云服务。 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {JSDOM,VirtualConsole}=require("jsdom"),{webcrypto}=require("node:crypto");
const page=fs.readFileSync(path.resolve(__dirname,"../../少年主公.html"),"utf8");
const version=page.match(/const APP_VERSION = "([^"]+)"/)[1];
let count=0;
async function test(name,fn){await fn();count++;console.log("通过 "+name);}
function make(extra={}){
 const calls=[],events={};let install=null;
 const registration={scope:"https://local.test/",active:{},installing:null,addEventListener(){}};
 const dom=new JSDOM(page,{url:"https://local.test/?sharecode=fixture",runScripts:"dangerously",virtualConsole:new VirtualConsole(),beforeParse(w){
  w.scrollTo=()=>{};w.confirm=()=>true;w.setTimeout=()=>0;w.clearTimeout=()=>{};
  w.localStorage.setItem("shaozhu_gate",page.match(/const GATE_HASH = "([^"]*)"/)[1]);
  Object.defineProperty(w,"crypto",{value:webcrypto});
  const sw={controller:{},register:async(url,opts)=>{calls.push({url,opts});if(extra.fail)throw new Error("403");return registration;},getRegistration:async()=>extra.noRegistration?undefined:registration,addEventListener:(k,fn)=>events[k]=fn};
  Object.defineProperty(w.navigator,"serviceWorker",{value:sw});
  Object.defineProperty(w,"caches",{value:{keys:async()=>extra.empty?[]:["shaozhu-v"+version],open:async()=>({match:async(url)=>{
   if(url.includes(".__shaozhu_verified__"))return extra.noProof?undefined:{json:async()=>extra.proof||install};
   const b=new TextEncoder().encode("validated fixture");return {status:200,arrayBuffer:async()=>extra.corrupt?new Uint8Array([0]).buffer:b.buffer};
  }})}});
 }});
 return {w:dom.window,calls,events,registration,async ready(){const b=new TextEncoder().encode("validated fixture");const hash=Buffer.from(await webcrypto.subtle.digest("SHA-256",b)).toString("hex");install={version,hashes:Object.fromEntries(["index.html","manifest.json","apple-touch-icon.png","icon-167.png","icon-192.png","icon-512.png","icon-maskable-192.png","icon-maskable-512.png"].map(f=>[f,hash]))};await Promise.resolve();await Promise.resolve();},end(){dom.window.close();}};
}
(async()=>{
 await test("注册保留分享参数且禁用脚本HTTP缓存",async()=>{const h=make();await h.ready();assert.equal(h.calls[0].url,"https://local.test/sw.js?sharecode=fixture");assert.equal(h.calls[0].opts.updateViaCache,"none");h.end();});
 await test("八项离线资源指纹完整可核验",async()=>{const h=make();await h.ready();assert.equal(await h.w.eval("checkOfflineReady()"),true);assert.match(h.w.eval("offlineStatusText()"),/已核验/);h.end();});
 for(const [name,opts] of [["未注册",{noRegistration:true}],["无缓存",{empty:true}],["无完成凭据",{noProof:true}],["版本不符",{proof:{version:"0.0.0",hashes:{}}}],["资源内容损坏",{corrupt:true}],["凭据无资源清单",{proof:{version,hashes:{}}}]]){
  await test(name+"不能假报离线可用",async()=>{const h=make(opts);await h.ready();assert.equal(await h.w.eval("checkOfflineReady()"),false);h.end();});
 }
 await test("授权失效消息不清存档且可见",async()=>{const h=make();await h.ready();const before=h.w.localStorage.getItem("shaozhu_v1");h.events.message({data:{type:"SHAOZHU_OFFLINE_STATUS",state:"authorization-required"}});assert.match(h.w.eval("offlineStatusText()"),/完整分享链接/);assert.equal(h.w.localStorage.getItem("shaozhu_v1"),before);h.end();});
 await test("设置页明确无云备份与离线状态",async()=>{const h=make();await h.ready();h.w.eval('PARENT_UNTIL=1e15;VIEW="settings";render()');assert.ok(h.w.document.querySelector("#offlineStatus"));assert.match(h.w.document.querySelector("#main").textContent,/没有云备份/);h.end();});
 console.log(`离线状态测试：${count} 通过 / 0 失败`);
})().catch(e=>{console.error(e);process.exitCode=1;});
