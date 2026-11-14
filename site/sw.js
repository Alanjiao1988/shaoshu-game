/* 少年主公 · 已验证应用壳优先。版本内不可变，升级必须完整安装新版本。
   只管理本应用的版本缓存，不读写用户记录，不绕过平台授权。 */
const VERSION = "2.8.0";
const PREFIX = "shaozhu-v";
const CACHE = PREFIX + VERSION;
const BASE = new URL("./", self.registration.scope);
const SHELL = new URL("index.html", BASE).href;
const RECEIPT = new URL(".__shaozhu_verified__", BASE).href;
const ICONS = {
  "apple-touch-icon.png": 180,
  "icon-167.png": 167,
  "icon-192.png": 192,
  "icon-512.png": 512,
  "icon-maskable-192.png": 192,
  "icon-maskable-512.png": 512
};
const CORE = ["index.html", "manifest.json", ...Object.keys(ICONS)];
const LEGACY_CORE = CORE.filter((name) => name !== "icon-167.png");
const absolute = (name) => new URL(name, BASE).href;
const cacheVersion = (name) => /^shaozhu-v(\d+\.\d+\.\d+)$/.exec(name)?.[1];
function compareVersions(a, b) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}
function isEntry(url) {
  return url.origin === BASE.origin &&
    (url.pathname === BASE.pathname || url.pathname === new URL(SHELL).pathname);
}
function requireResponse(response, type) {
  if (!response || response.status !== 200 || response.redirected ||
      !["basic", "default"].includes(response.type) ||
      !type.test(response.headers.get("content-type") || "")) {
    throw new Error("资源响应未通过验证");
  }
  if (response.url) {
    const url = new URL(response.url);
    if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) {
      throw new Error("资源离开了应用范围");
    }
  }
}
async function shellVersion(response) {
  requireResponse(response, /^text\/html\b/i);
  const text = await response.clone().text();
  if (!/^\s*<!doctype\s+html\s*>/i.test(text) ||
      !/<title>\s*少年主公 · 学习军令台\s*<\/title>/i.test(text) ||
      !/<main\s+id=["']main["']\s*>/i.test(text) ||
      !/<\/body\s*>\s*<\/html\s*>\s*$/i.test(text)) {
    throw new Error("不是完整的少年主公应用壳");
  }
  const scripts = [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter((match) => !/\bsrc\s*=/i.test(match[1])).map((match) => match[2]);
  const versions = scripts.flatMap((script) => [...script.matchAll(
    /^\s*const\s+APP_VERSION\s*=\s*(["'])(\d+\.\d+\.\d+)\1\s*;/gm
  )]);
  if (versions.length !== 1 || !scripts.some((script) =>
    /^\s*const\s+APP_VERSION\s*=/m.test(script) &&
    /^\s*const\s+KEY\s*=\s*(["'])shaozhu_v1\1\s*;/m.test(script))) {
    throw new Error("应用版本或唯一应用标志缺失");
  }
  return versions[0][2];
}
async function validateAsset(name, response, version, legacy = false) {
  if (name === "index.html") {
    if (await shellVersion(response) !== version) throw new Error("应用壳版本不匹配");
    return;
  }
  if (name === "manifest.json") {
    requireResponse(response, /^(application\/(manifest\+json|json))\b/i);
    const manifest = await response.clone().json();
    if (manifest.name !== "少年主公 · 学习军令台" || manifest.short_name !== "少年主公" ||
        manifest.scope !== "./" || manifest.display !== "standalone" ||
        (!legacy && Object.hasOwn(manifest, "start_url")) || !Array.isArray(manifest.icons)) {
      throw new Error("应用清单不匹配或会丢失完整入口");
    }
    for (const name of Object.keys(ICONS).filter((name) => name.startsWith("icon-") && name !== "icon-167.png")) {
      const size = ICONS[name];
      if (!manifest.icons.some((icon) => icon.src === name && icon.type === "image/png" &&
          icon.sizes === `${size}x${size}` && icon.purpose === (name.includes("maskable") ? "maskable" : "any"))) {
        throw new Error("应用清单图标不完整");
      }
    }
    return;
  }
  requireResponse(response, /^image\/png\b/i);
  const bytes = new Uint8Array(await response.clone().arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const ending = [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
  if (bytes.length < 45 || !signature.every((byte, i) => bytes[i] === byte) ||
      bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82 ||
      !ending.every((byte, i) => bytes[bytes.length - 12 + i] === byte)) {
    throw new Error("图标不是完整 PNG");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || view.getUint32(16) !== ICONS[name] || view.getUint32(20) !== ICONS[name]) {
    throw new Error("图标尺寸不匹配");
  }
  let offset = 8, hasImageData = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error("PNG 数据块被截断");
    const length = view.getUint32(offset);
    const end = offset + 8 + length;
    if (end + 4 > bytes.length) throw new Error("PNG 数据块长度无效");
    let crc = 0xffffffff;
    for (let i = offset + 4; i < end; i++) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(end)) throw new Error("PNG 数据块校验失败");
    if (bytes[offset + 4] === 73 && bytes[offset + 5] === 68 &&
        bytes[offset + 6] === 65 && bytes[offset + 7] === 84 && length > 0) hasImageData = true;
    offset = end + 4;
  }
  if (!hasImageData) throw new Error("PNG 缺少图像数据");
}
async function fingerprint(response) {
  const digest = await crypto.subtle.digest("SHA-256", await response.clone().arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function receipt(cache, version) {
  const response = await cache.match(RECEIPT);
  if (!response) return null;
  const data = await response.json();
  if (data.version !== version || !data.hashes || CORE.some((name) =>
    !/^[a-f0-9]{64}$/.test(data.hashes[name] || ""))) throw new Error("安装凭据无效");
  return data;
}
// 历史缓存没有安装凭据时，只允许通过身份、状态、版本验证的 HTML 用作回退。
async function readShell(name) {
  try {
    const version = cacheVersion(name);
    if (!version || compareVersions(version, VERSION) > 0) return null;
    const cache = await caches.open(name);
    const proof = await receipt(cache, version);
    if (name === CACHE && !proof) return null;
    for (const key of [SHELL, BASE.href]) {
      const response = await cache.match(key);
      if (!response) continue;
      try {
        await validateAsset("index.html", response, version);
        if (proof && await fingerprint(response) !== proof.hashes["index.html"]) continue;
        return { name, version, cache, proof, response };
      } catch (_) { /* 污染的根入口和 index.html 均不能冒充应用壳。 */ }
    }
  } catch (_) { /* 读取失败不改动原缓存。 */ }
  return null;
}
async function validBundle(name) {
  try {
    const shell = await readShell(name);
    if (!shell) return null;
    const assets = shell.proof ? CORE : LEGACY_CORE;
    for (const asset of assets) {
      const response = asset === "index.html" ? shell.response : await shell.cache.match(absolute(asset));
      await validateAsset(asset, response, shell.version, !shell.proof);
      if (shell.proof && await fingerprint(response) !== shell.proof.hashes[asset]) return null;
    }
    return shell;
  } catch (_) { return null; }
}
async function cachedShell() {
  const names = (await caches.keys()).filter((name) => cacheVersion(name) &&
    compareVersions(cacheVersion(name), VERSION) <= 0)
    .sort((a, b) => compareVersions(cacheVersion(b), cacheVersion(a)));
  for (const name of names) {
    const shell = await readShell(name);
    if (shell) return shell;
  }
  return null;
}
async function network(url) {
  return fetch(url, { cache: "no-store", credentials: "same-origin", redirect: "error" });
}
async function installationEntry() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const entries = clients.filter((client) => isEntry(new URL(client.url)));
  entries.sort((a, b) => Number(b.focused) - Number(a.focused) ||
    Number(b.visibilityState === "visible") - Number(a.visibilityState === "visible"));
  return new URL(entries[0]?.url || BASE.href);
}
async function install() {
  const entry = await installationEntry();
  const staged = [], hashes = {};
  // 先在内存中完整下载、验证；网络失败不会创建或删除任何旧缓存。
  for (const asset of CORE) {
    const url = asset === "index.html" ? new URL(entry.href) : new URL(asset, BASE);
    url.search = entry.search;
    url.hash = "";
    const response = await network(url.href);
    await validateAsset(asset, response, VERSION);
    hashes[asset] = await fingerprint(response);
    staged.push([absolute(asset), response]);
  }
  const existed = (await caches.keys()).includes(CACHE);
  if (existed) {
    const installed = await validBundle(CACHE);
    if (!installed || CORE.some((asset) => installed.proof.hashes[asset] !== hashes[asset])) {
      throw new Error("同一版本已有不同或不完整内容，请使用新版本号发布");
    }
  } else {
    try {
      const cache = await caches.open(CACHE);
      for (const [url, response] of staged) await cache.put(url, response);
      // 最后写完成凭据；中途写入失败不能变成可用安装。
      await cache.put(RECEIPT, new Response(JSON.stringify({ version: VERSION, hashes }), {
        headers: { "Content-Type": "application/json" }
      }));
      if (!await validBundle(CACHE)) throw new Error("安装后校验失败");
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  }
  await self.skipWaiting();
}
self.addEventListener("install", (event) => event.waitUntil(install()));
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    if (!await validBundle(CACHE)) throw new Error("新版本不完整，禁止清理和接管");
    const names = (await caches.keys()).filter((name) => cacheVersion(name) &&
      compareVersions(cacheVersion(name), VERSION) < 0)
      .sort((a, b) => compareVersions(cacheVersion(b), cacheVersion(a)));
    let previous = null;
    for (const name of names) {
      if (await validBundle(name)) { previous = name; break; }
    }
    // 至少保留上一完整可用版本；不完整的历史壳仍可回退，但不据此删除完整备份。
    if (previous) {
      for (const name of names) {
        if (compareVersions(cacheVersion(name), cacheVersion(previous)) < 0 && await validBundle(name)) {
          await caches.delete(name);
        }
      }
    }
    await self.clients.claim();
  })());
});
async function notify(event, state, version) {
  const client = event.clientId && await self.clients.get(event.clientId);
  if (client) client.postMessage({ type: "SHAOZHU_OFFLINE_STATUS", state, cachedVersion: version });
}
async function probe(event, shell) {
  try {
    const response = await network(event.request.url);
    if (response.status === 403) return await notify(event, "authorization-required", shell.version);
    const version = await shellVersion(response);
    const state = version !== shell.version ? "update-available" :
      await fingerprint(response) !== await fingerprint(shell.response) ? "content-changed" : "verified";
    await notify(event, state, shell.version);
  } catch (_) {
    await notify(event, "unavailable", shell.version);
  }
  // 探测永不写缓存；即使版本相同，内容变化也必须使用新版本完整安装。
}
function escapeHTML(text) {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function recovery(request, status) {
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>少年主公 · 暂时无法启动</title>
<style>body{font:18px/1.7 system-ui;max-width:640px;margin:10vh auto;padding:24px;color:#332c26;background:#fbf6ec}input{box-sizing:border-box;width:100%;padding:12px}button,a{display:inline-block;margin:16px 0;padding:10px}p[role]{color:#a22}</style>
<h1>暂时无法启动</h1><p>没有可用的已验证离线副本，或当前网络、分享授权不可用（状态 ${status}）。这不是可用的应用页面。</p>
<p>请联网后使用最新的完整分享链接（保留全部查询参数）。平台 403 需要恢复有效授权，本地离线功能不能绕过它。</p>
<a id="retry" href="${escapeHTML(request.url)}">使用当前完整链接重试</a>
<form id="recover"><label for="entry">最新的完整分享链接</label><input id="entry" type="url" required autocomplete="off" placeholder="粘贴此应用的完整分享链接"><button>打开完整链接</button><p id="error" role="alert"></p></form>
<p>本页不会清除本机学习记录。此恢复入口只对已由 Service Worker 控制的页面有效；未注册且没有有效缓存的设备仍需先正常联网授权。</p>
<script>
document.getElementById("retry").href = location.href;
document.getElementById("recover").addEventListener("submit", function(event) {
  event.preventDefault();
  try {
    const url = new URL(document.getElementById("entry").value);
    const base = new URL("./", location.href);
    if (url.origin !== base.origin || (url.pathname !== base.pathname && url.pathname !== new URL("index.html", base).pathname)) throw new Error();
    location.assign(url.href);
  } catch (_) { document.getElementById("error").textContent = "请使用此应用同一地址下有效的完整链接，保留所有分享参数。"; }
});
</script></html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'"
    }
  });
}
async function navigate(event, background) {
  const shell = await cachedShell();
  if (shell) {
    background(probe(event, shell).catch(() => {}));
    return shell.response;
  }
  let status = 503;
  try {
    const response = await network(event.request.url);
    if (response.status >= 400 && response.status <= 599) status = response.status;
    await validateAsset("index.html", response, VERSION);
    return response;
  } catch (_) {
    return recovery(event.request, status);
  }
}
async function staticAsset(event, name) {
  const shell = await cachedShell();
  if (shell) {
    const response = await shell.cache.match(absolute(name));
    try {
      await validateAsset(name, response, shell.version, !shell.proof);
      if (!shell.proof || await fingerprint(response) === shell.proof.hashes[name]) return response;
    } catch (_) { /* 不返回损坏的静态文件。 */ }
  }
  const url = new URL(event.request.url);
  if (!url.search && event.clientId) {
    const client = await self.clients.get(event.clientId);
    if (client && isEntry(new URL(client.url))) url.search = new URL(client.url).search;
  }
  try {
    const response = await network(url.href);
    await validateAsset(name, response, VERSION);
    return response;
  } catch (_) {
    return new Response("资源不可用，请使用完整分享链接联网重试。", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
}
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin) return;
  if (request.mode === "navigate" && isEntry(url)) {
    // 同步登记 waitUntil，避免异步读取缓存后生命周期已经结束。
    const tasks = [];
    const response = navigate(event, (task) => tasks.push(task));
    event.respondWith(response);
    event.waitUntil(response.then(() => Promise.all(tasks)));
    return;
  }
  const name = CORE.find((asset) => absolute(asset) === url.origin + url.pathname);
  if (name && name !== "index.html") event.respondWith(staticAsset(event, name));
});
