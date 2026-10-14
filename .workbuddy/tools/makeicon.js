/* 生成应用图标（含 maskable 版本）
   用法：node .workbuddy/tools/makeicon.js
   - 普通版：内容铺满整块，交给 iOS / Chrome 自己裁圆角
   - maskable 版：把内容缩到中心 72%，四周留够安全区，安卓/鸿蒙裁成圆形时才不会切到字
*/
const fs = require("fs"), path = require("path"), http = require("http"), net = require("net"), { spawn } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "site");
const TMP = path.join(__dirname, "_icon_tmp");
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

// 端口必须是真空的，否则会连到上一轮残留的 Chrome
function isPortFree(port){
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}
async function freePort(start, span){
  for (let i = 0; i < 80; i++){
    const p = start + Math.floor(Math.random() * span);
    if (await isPortFree(p)) return p;
  }
  return await new Promise(res => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => res(p)); });
  });
}

function buildHtml(maskable){
  // maskable 时把装饰内容缩到 72%，背景仍然铺满
  const inner = maskable
    ? '<g transform="translate(256,256) scale(0.72) translate(-256,-256)">'
    : '<g>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;}
  svg{display:block;width:100%;height:100%;}
</style></head><body>
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#CE4A3E"/>
      <stop offset="0.55" stop-color="#B03A31"/>
      <stop offset="1" stop-color="#88302A"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  ${inner}
    <rect x="46" y="46" width="420" height="420" rx="58" fill="none"
          stroke="#FFF4E6" stroke-opacity="0.34" stroke-width="7"/>
    <text x="171" y="262" text-anchor="middle" dominant-baseline="central"
          font-family="Songti SC, STSong, SimSun, serif" font-size="182" font-weight="700"
          fill="#FFF6EC">主</text>
    <text x="341" y="262" text-anchor="middle" dominant-baseline="central"
          font-family="Songti SC, STSong, SimSun, serif" font-size="182" font-weight="700"
          fill="#FFF6EC">公</text>
    <text x="256" y="408" text-anchor="middle" dominant-baseline="central"
          font-family="Songti SC, STSong, SimSun, serif" font-size="42"
          fill="#FFF6EC" fill-opacity="0.62" letter-spacing="8">少年</text>
  </g>
</svg>
</body></html>`;
}
fs.writeFileSync(path.join(TMP, "icon.html"), buildHtml(false), "utf8");
fs.writeFileSync(path.join(TMP, "icon-maskable.html"), buildHtml(true), "utf8");

let PORT = 9700, CHROME_PORT = 9900;   // 实际值在启动前动态获取
const profile = path.join(TMP, "prof_" + Date.now().toString(36));
// 先扫掉上一轮遗留的 profile（被 Chrome 锁住的删不掉就留着，本轮用新目录不受影响）
try {
  fs.readdirSync(TMP).filter(n => n.startsWith("prof")).forEach(n => {
    try { fs.rmSync(path.join(TMP, n), { recursive: true, force: true }); } catch (e) {}
  });
} catch (e) {}
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((resolve, reject) => {
  http.get(url, res => { let d = ""; res.on("data", c => d += c);
    res.on("end", () => { if (!d.trim()) return reject(new Error("空响应"));
      try { resolve(JSON.parse(d)); } catch (e) { reject(new Error("JSON 解析失败")); } }); }).on("error", reject);
});
class CDP {
  constructor(ws){ this.ws=ws; this.id=0; this.pending=new Map(); }
  static async connect(url){
    const ws = new WebSocket(url);
    await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=rej; });
    const c = new CDP(ws);
    ws.onmessage = ev => { const m=JSON.parse(ev.data);
      if(m.id && c.pending.has(m.id)){ c.pending.get(m.id)(m); c.pending.delete(m.id); } };
    return c;
  }
  send(method, params){ const id=++this.id;
    this.ws.send(JSON.stringify({id, method, params: params||{}}));
    return new Promise(r => this.pending.set(id, r)); }
  async eval(expr){
    const r = await this.send("Runtime.evaluate",{expression:expr, returnByValue:true, awaitPromise:true});
    if(r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0,160));
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
}
const server = http.createServer((req,res)=>{
  const f = path.join(TMP, decodeURIComponent(req.url.split("?")[0]).replace(/^\//,""));
  if(f.startsWith(TMP) && fs.existsSync(f) && fs.statSync(f).isFile()){
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
    res.end(fs.readFileSync(f));
  } else { res.writeHead(404); res.end("no"); }
});

// [html文件, 尺寸, 输出名]
const JOBS = [
  ["icon.html",           512, "icon-512.png"],
  ["icon.html",           192, "icon-192.png"],
  ["icon.html",           180, "apple-touch-icon.png"],
  ["icon.html",           167, "icon-167.png"],
  ["icon-maskable.html",  512, "icon-maskable-512.png"],
  ["icon-maskable.html",  192, "icon-maskable-192.png"],
];

(async () => {
  let child;
  let ver = null;
  try {
    PORT = await freePort(9700, 150);
    CHROME_PORT = await freePort(9900, 90);
    await new Promise(r => server.listen(PORT, "127.0.0.1", r));
    child = spawn(chrome, [
      "--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check",
      "--disable-extensions","--hide-scrollbars",
      "--disable-background-mode","--disable-background-networking",
      "--user-data-dir="+profile,"--remote-debugging-port="+CHROME_PORT,
      `http://127.0.0.1:${PORT}/icon.html`
    ], { stdio:"ignore" });

    for(let i=0;i<60;i++){ try{ ver=await getJSON(`http://127.0.0.1:${CHROME_PORT}/json/version`); break; }catch(e){ await sleep(400); } }
    if(!ver) throw new Error("CDP 未就绪");
    const list = await getJSON(`http://127.0.0.1:${CHROME_PORT}/json/list`);
    const page = list.find(t => t.type==="page" && t.url.includes("icon"));
    if(!page) throw new Error("找不到图标页面");

    const cdp = await CDP.connect(page.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
    await sleep(1100);

    let last = null;
    for (const [html, size, name] of JOBS) {
      if (html !== last) {
        await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/${html}` });
        await sleep(1100);
        last = html;
      }
      await cdp.send("Emulation.setDeviceMetricsOverride",{width:size,height:size,deviceScaleFactor:1,mobile:false});
      await sleep(420);
      const r = await cdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
      const buf = Buffer.from(r.result.data,"base64");
      fs.writeFileSync(path.join(OUT, name), buf);
      console.log(`  🎨 ${name.padEnd(26)} ${size}×${size}  ${Math.round(buf.length/1024)}KB`);
    }
    try { cdp.ws.close(); } catch(e){}
  } catch(e){
    console.error("生成失败：" + e.message);
    process.exitCode = 1;
  } finally {
    // 用 CDP 的 Browser.close 整棵进程树一起退，否则 profile 目录删不掉
    try { if (ver && ver.webSocketDebuggerUrl) { const bc = await CDP.connect(ver.webSocketDebuggerUrl); await bc.send("Browser.close"); } } catch(e){}
    try { if(child) child.kill(); } catch(e){}
    try { server.close(); } catch(e){}
    await sleep(500);
    try { fs.rmSync(TMP, { recursive:true, force:true }); } catch(e){}
    process.exit(process.exitCode || 0);
  }
})();
