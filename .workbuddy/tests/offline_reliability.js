/* 纯 Node/VM 离线故障测试：只读工作区，fetch/caches/客户端全部在内存模拟。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto, createHash } = require("node:crypto");
const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "site/sw.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "site/manifest.json"), "utf8"));
const page = fs.readFileSync(path.join(root, "site/index.html"), "utf8");
const base = "https://offline.test/site/";
const current = "shaozhu-v2.7.0";
const proofKey = base + ".__shaozhu_verified__";
const icons = ["apple-touch-icon.png", "icon-167.png", "icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png"];
const core = ["index.html", "manifest.json", ...icons];
const png = Object.fromEntries(icons.map((name) => [name, fs.readFileSync(path.join(root, "site", name))]));
function changedPNG(name) {
  const payload = Buffer.from("fixture\0different-build");
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write("tEXt", 4);
  payload.copy(chunk, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < chunk.length - 4; i++) {
    crc ^= chunk[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return Buffer.concat([png[name].subarray(0, -12), chunk, png[name].subarray(-12)]);
}
const tests = [];
const test = (name, action) => tests.push([name, action]);
const versioned = (version = "2.7.0", suffix = "") => page.replace(
  /const APP_VERSION = "[^"]+";/, `const APP_VERSION = "${version}";`
).replace("</body>", `${suffix}</body>`);
const html = (text, status = 200) => new Response(text, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
const json = (value) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/manifest+json" } });
function resource(name, version = "2.7.0", suffix = "", legacy = false) {
  if (name === "index.html") return html(versioned(version, suffix));
  if (name === "manifest.json") return json(legacy ? { ...manifest, start_url: "./" } : manifest);
  return new Response(png[name], { headers: { "Content-Type": "image/png" } });
}
function storage() {
  const maps = new Map(), writes = [], deleted = [];
  const state = { maps, writes, deleted, failPut: null };
  const keyOf = (key) => new URL(typeof key === "string" ? key : key.url, base).href;
  state.open = async (name) => {
    if (!maps.has(name)) maps.set(name, new Map());
    const map = maps.get(name);
    return {
      async match(key) { const response = map.get(keyOf(key)); return response?.clone(); },
      async put(key, response) {
        const url = keyOf(key);
        if (state.failPut?.(name, url)) throw new Error("模拟缓存配额不足");
        writes.push([name, url]);
        map.set(url, response.clone());
      }
    };
  };
  state.keys = async () => [...maps.keys()];
  state.delete = async (name) => { deleted.push(name); return maps.delete(name); };
  state.snapshot = async () => {
    const result = [];
    for (const [name, map] of maps) {
      const entries = [];
      for (const [key, response] of map) entries.push([key, response.status, [...response.headers], Buffer.from(await response.clone().arrayBuffer()).toString("base64")]);
      result.push([name, entries]);
    }
    return JSON.stringify(result);
  };
  return state;
}
async function seed(store, version, options = {}) {
  const cache = await store.open("shaozhu-v" + version), hashes = {};
  for (const name of core) {
    if (options.omit === name || (!options.proof && name === "icon-167.png")) continue;
    const response = resource(name, version, options.suffix || "", !options.proof);
    hashes[name] = createHash("sha256").update(Buffer.from(await response.clone().arrayBuffer())).digest("hex");
    await cache.put(base + name, response);
  }
  if (options.proof) await cache.put(proofKey, json({ version, hashes }));
  return cache;
}
function harness(options = {}) {
  const caches = options.caches || storage();
  const listeners = new Map(), requests = [], messages = [];
  const clients = options.clients || [{ id: "page", url: base + "?secret=fixture-secret&sharecode=fixture-code", focused: true, visibilityState: "visible" }];
  for (const client of clients) client.postMessage = (message) => messages.push(message);
  let skipped = 0, claimed = 0;
  const state = { caches, requests, messages, handler: options.fetch || ((url) => {
    const name = new URL(url).pathname.split("/").pop() || "index.html";
    return resource(name);
  }) };
  const self = {
    registration: { scope: base },
    clients: {
      matchAll: async () => clients,
      get: async (id) => clients.find((client) => client.id === id),
      claim: async () => { claimed++; }
    },
    skipWaiting: async () => { skipped++; },
    addEventListener: (name, handler) => listeners.set(name, handler)
  };
  const context = vm.createContext({
    self, caches, URL, Request, Response, Headers, crypto: webcrypto, Uint8Array, DataView,
    fetch: async (request, init) => {
      const url = typeof request === "string" ? request : request.url;
      requests.push({ url, init });
      return state.handler(url, init);
    }
  });
  Object.defineProperty(context, "localStorage", { get() { throw new Error("不得访问真实记录"); } });
  vm.runInContext(source, context, { filename: "site/sw.js" });
  state.lifecycle = async (name) => {
    const tasks = [];
    let dispatching = true;
    listeners.get(name)({ waitUntil(task) { assert.ok(dispatching, "waitUntil 必须在事件分发时登记"); tasks.push(task); } });
    dispatching = false;
    await Promise.all(tasks);
  };
  state.dispatch = (url = base, mode = "navigate", method = "GET") => {
    const tasks = [];
    let response, dispatching = true;
    listeners.get("fetch")({
      request: { url, mode, method }, clientId: "page",
      respondWith(task) { assert.ok(dispatching); response = Promise.resolve(task); },
      waitUntil(task) { assert.ok(dispatching, "waitUntil 不得延迟登记"); tasks.push(task); }
    });
    dispatching = false;
    return { response, done: () => Promise.all(tasks) };
  };
  state.navigate = async (url = base) => {
    const event = state.dispatch(url);
    const response = await event.response;
    await event.done();
    return response;
  };
  Object.defineProperties(state, { skipped: { get: () => skipped }, claimed: { get: () => claimed } });
  return state;
}
async function unavailable(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const text = await response.text();
  assert.match(text, /暂时无法启动/);
  assert.match(text, /不能绕过/);
  assert.match(text, /没有有效缓存/);
  assert.doesNotMatch(text, /const APP_VERSION/);
  return text;
}

test("版本为 2.7.0，manifest 不再强制无参根入口", async () => {
  assert.match(source, /const VERSION = "2\.7\.0";/);
  assert.equal(Object.hasOwn(manifest, "start_url"), false);
  assert.doesNotMatch(source, /localStorage|indexedDB|\.unregister\(/);
});
test("完整安装下载八项资源且全部携带当前分享参数", async () => {
  const h = harness();
  await h.lifecycle("install");
  assert.equal(h.skipped, 1);
  assert.equal(h.requests.length, core.length);
  for (const { url, init } of h.requests) {
    assert.equal(new URL(url).search, "?secret=fixture-secret&sharecode=fixture-code");
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
  }
  assert.equal(h.caches.writes.at(-1)[1], proofKey);
  assert.deepEqual(await h.caches.keys(), [current]);
});
test("无页面客户端安装时仍必须完整验证", async () => {
  const h = harness({ clients: [] });
  await h.lifecycle("install");
  assert.equal(h.skipped, 1);
  assert.equal(h.requests[0].url, base);
});
for (const status of [403, 500]) {
  test(`安装 HTML ${status} 拒绝，不 skipWaiting 且旧缓存完全不变`, async () => {
    const caches = storage();
    await seed(caches, "2.6.1");
    await (await caches.open("another-app")).put(base, html("其他应用"));
    const before = await caches.snapshot();
    const h = harness({ caches, fetch: () => html("错误", status) });
    await assert.rejects(h.lifecycle("install"));
    assert.equal(h.skipped, 0);
    assert.equal(await caches.snapshot(), before);
    assert.deepEqual(caches.deleted, []);
  });
  test(`无缓存导航 ${status} 显示失败与完整链接恢复入口，不写缓存`, async () => {
    const h = harness({ fetch: () => html("错误", status) });
    const text = await unavailable(await h.navigate(base + "?secret=fixture-new&sharecode=fixture-next"), status);
    assert.match(text, /\?secret=fixture-new&amp;sharecode=fixture-next/);
    assert.deepEqual(await h.caches.keys(), []);
  });
}
const invalidHTML = [
  ["普通 200 HTML 错误页", "<!doctype html><html><title>服务不可用</title><body>错误</body></html>"],
  ["只有版本标志的错误页", '<!doctype html><html><body><script>\nconst APP_VERSION = "2.7.0";\n</script></body></html>'],
  ["缺失唯一应用标志", versioned().replace('const KEY = "shaozhu_v1";', 'const KEY = "another-app";')],
  ["版本跨到 2.8.0", versioned("2.8.0")],
  ["主页面仍为旧版 2.6.1", versioned("2.6.1")],
  ["缺失 const APP_VERSION", versioned().replace('const APP_VERSION = "2.7.0";', "")],
  ["重复版本常量", versioned().replace("</script>", '\nconst APP_VERSION = "2.7.0";\n</script>')],
  ["截断 HTML", versioned().replace(/<\/body>[\s\S]*$/, "")]
];
for (const [name, text] of invalidHTML) {
  test(`${name}不能安装或冒充可用导航`, async () => {
    const h = harness({ fetch: () => html(text) });
    await assert.rejects(h.lifecycle("install"));
    assert.equal(h.skipped, 0);
    await unavailable(await h.navigate(), 503);
    assert.deepEqual(await h.caches.keys(), []);
  });
}
const badResources = [
  ["manifest 403", "manifest.json", () => html("拒绝", 403)],
  ["manifest 非 JSON", "manifest.json", () => new Response("broken", { headers: { "Content-Type": "application/json" } })],
  ["manifest 保留无参 start_url", "manifest.json", () => json({ ...manifest, start_url: "./" })],
  ["manifest 缺少图标声明", "manifest.json", () => json({ ...manifest, icons: [] })],
  ["图标网络失败", "icon-512.png", () => { throw new TypeError("离线"); }],
  ["图标返回 500", "icon-512.png", () => html("错误", 500)],
  ["图标返回 200 HTML", "icon-192.png", () => html("错误")],
  ["图标伪造 MIME", "icon-192.png", () => new Response("不是图片", { headers: { "Content-Type": "image/png" } })],
  ["图标尺寸错误", "icon-192.png", () => resource("icon-512.png")],
  ["图标 PNG 截断", "icon-192.png", () => new Response(png["icon-192.png"].subarray(0, 40), { headers: { "Content-Type": "image/png" } })],
  ["图标 PNG 数据损坏", "icon-512.png", () => {
    const bytes = Buffer.from(png["icon-512.png"]);
    bytes[50] ^= 1;
    return new Response(bytes, { headers: { "Content-Type": "image/png" } });
  }],
  ["图标没有任何图像数据", "icon-192.png", () => new Response(Buffer.concat([
    png["icon-192.png"].subarray(0, 33), png["icon-192.png"].subarray(-12)
  ]), { headers: { "Content-Type": "image/png" } })]
];
for (const [name, target, make] of badResources) {
  test(`${name}必须使整次安装失败并保留旧版本`, async () => {
    const caches = storage();
    await seed(caches, "2.6.1");
    const before = await caches.snapshot();
    const h = harness({ caches, fetch: (url) => {
      const name = new URL(url).pathname.split("/").pop() || "index.html";
      return name === target ? make() : resource(name);
    } });
    await assert.rejects(h.lifecycle("install"));
    assert.equal(h.skipped, 0);
    assert.equal(await caches.snapshot(), before);
    assert.deepEqual(caches.deleted, []);
  });
}
test("缓存写入失败回滚新版本，旧缓存不变", async () => {
  const caches = storage();
  await seed(caches, "2.6.1");
  const before = await caches.snapshot();
  caches.failPut = (name, url) => name === current && url.endsWith("icon-192.png");
  const h = harness({ caches });
  await assert.rejects(h.lifecycle("install"));
  assert.equal(h.skipped, 0);
  assert.equal(await caches.snapshot(), before);
  assert.deepEqual(caches.deleted, [current]);
});
test("完成凭据写入失败也回滚新版本", async () => {
  const h = harness();
  h.caches.failPut = (_, url) => url === proofKey;
  await assert.rejects(h.lifecycle("install"));
  assert.equal(h.skipped, 0);
  assert.deepEqual(await h.caches.keys(), []);
});
test("安装失败后旧 SW 缓存仍可离线启动", async () => {
  const caches = storage();
  await seed(caches, "2.6.1");
  const h = harness({ caches, fetch: () => { throw new TypeError("离线"); } });
  await assert.rejects(h.lifecycle("install"));
  assert.equal(h.skipped, 0);
  const response = await h.navigate();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), versioned("2.6.1"));
});
test("激活只删除已验证的更老整包，保留上一完整版本和其他缓存", async () => {
  const h = harness();
  await h.lifecycle("install");
  await seed(h.caches, "2.6.1");
  await seed(h.caches, "2.6.0");
  await seed(h.caches, "2.5.9", { omit: "icon-512.png" });
  await seed(h.caches, "2.8.0", { proof: true });
  await (await h.caches.open("shaozhu-v2.5.8")).put(base + "index.html", html("损坏"));
  for (const name of ["another-app", "shaozhu-settings", "shaozhu-v2.0.0-other"]) await h.caches.open(name);
  await h.lifecycle("activate");
  assert.equal(h.claimed, 1);
  assert.deepEqual(h.caches.deleted, ["shaozhu-v2.6.0"]);
  for (const name of [current, "shaozhu-v2.6.1", "shaozhu-v2.5.9", "shaozhu-v2.5.8", "shaozhu-v2.8.0", "another-app", "shaozhu-settings", "shaozhu-v2.0.0-other"]) assert.ok(h.caches.maps.has(name), name);
});
test("最近旧版本只有 HTML 时不据此删掉上一完整版本", async () => {
  const h = harness();
  await h.lifecycle("install");
  await seed(h.caches, "2.6.1", { omit: "icon-512.png" });
  await seed(h.caches, "2.6.0");
  await seed(h.caches, "2.5.9");
  await h.lifecycle("activate");
  assert.ok(h.caches.maps.has("shaozhu-v2.6.0"));
  assert.deepEqual(h.caches.deleted, ["shaozhu-v2.5.9"]);
});
test("旧版凭据摘要不匹配时不得清理，且继续保留上一完整版本", async () => {
  const h = harness();
  await h.lifecycle("install");
  await seed(h.caches, "2.6.1", { proof: true });
  await seed(h.caches, "2.6.0", { proof: true });
  h.caches.maps.get("shaozhu-v2.6.0").set(base + "icon-512.png", new Response(changedPNG("icon-512.png"), { headers: { "Content-Type": "image/png" } }));
  await h.lifecycle("activate");
  assert.ok(h.caches.maps.has("shaozhu-v2.6.1"));
  assert.ok(h.caches.maps.has("shaozhu-v2.6.0"));
  assert.deepEqual(h.caches.deleted, []);
});
test("当前安装损坏时禁止激活清理和接管", async () => {
  const h = harness();
  await h.lifecycle("install");
  await seed(h.caches, "2.6.1");
  h.caches.maps.get(current).set(base + "icon-192.png", html("污染"));
  const before = await h.caches.snapshot();
  await assert.rejects(h.lifecycle("activate"));
  assert.equal(h.claimed, 0);
  assert.equal(await h.caches.snapshot(), before);
  assert.deepEqual(h.caches.deleted, []);
});
test("当前损坏自动回退旧版，污染历史 index 时允许验证根副本", async () => {
  const h = harness();
  await h.lifecycle("install");
  const old = await seed(h.caches, "2.6.1");
  await old.put(base, resource("index.html", "2.6.1"));
  await old.put(base + "index.html", html("403", 403));
  h.caches.maps.get(current).set(base + "index.html", html("污染"));
  h.handler = () => { throw new TypeError("离线"); };
  assert.equal(await (await h.navigate()).text(), versioned("2.6.1"));
});
for (const [name, handler, state] of [
  ["403", () => html("拒绝", 403), "authorization-required"],
  ["500", () => html("错误", 500), "unavailable"],
  ["200 错误页", () => html("普通错误页"), "unavailable"],
  ["离线", () => { throw new TypeError("离线"); }, "unavailable"],
  ["新版本", () => resource("index.html", "2.8.0"), "update-available"],
  ["相同版本不同内容", () => resource("index.html", "2.7.0", "<!--不同构建-->"), "content-changed"],
  ["相同版本相同内容", () => resource("index.html"), "verified"]
]) {
  test(`已有应用壳遇到${name}仍返回原缓存且不静默覆盖`, async () => {
    const h = harness();
    await h.lifecycle("install");
    const before = await h.caches.snapshot();
    h.handler = handler;
    const url = base + "?secret=fixture-latest&sharecode=fixture-latest-code";
    const response = await h.navigate(url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), versioned());
    assert.equal(await h.caches.snapshot(), before);
    assert.equal(h.requests.at(-1).url, url);
    assert.equal(h.messages.at(-1).state, state);
  });
}
test("网络探测永不阻塞 cache-first 返回", async () => {
  const h = harness();
  await h.lifecycle("install");
  let release;
  h.handler = () => new Promise((resolve) => { release = resolve; });
  const event = h.dispatch(base + "?sharecode=fixture-next");
  const response = await event.response;
  assert.equal(await response.text(), versioned());
  assert.equal(typeof release, "function");
  release(resource("index.html"));
  await event.done();
});
test("同版本重新安装不同内容必须拒绝且不动既有缓存", async () => {
  const h = harness();
  await h.lifecycle("install");
  const before = await h.caches.snapshot();
  h.handler = (url) => resource(new URL(url).pathname.split("/").pop() || "index.html", "2.7.0", "<!--另一构建-->");
  await assert.rejects(h.lifecycle("install"));
  assert.equal(h.skipped, 1);
  assert.equal(await h.caches.snapshot(), before);
  assert.deepEqual(h.caches.deleted, []);
});
test("同版本只有图标内容变化也必须拒绝重装", async () => {
  const h = harness();
  await h.lifecycle("install");
  const before = await h.caches.snapshot();
  h.handler = (url) => {
    const name = new URL(url).pathname.split("/").pop() || "index.html";
    if (name !== "icon-512.png") return resource(name);
    return new Response(changedPNG(name), { headers: { "Content-Type": "image/png" } });
  };
  await assert.rejects(h.lifecycle("install"));
  assert.equal(h.skipped, 1);
  assert.equal(await h.caches.snapshot(), before);
});
test("同版本完全相同可重装但不重写缓存", async () => {
  const h = harness();
  await h.lifecycle("install");
  const writes = h.caches.writes.length;
  await h.lifecycle("install");
  assert.equal(h.skipped, 2);
  assert.equal(h.caches.writes.length, writes);
});
test("同版本预先存在的损坏缓存安装失败时也不擅自删除", async () => {
  const caches = storage();
  await (await caches.open(current)).put(base + "index.html", html("污染"));
  const before = await caches.snapshot();
  const h = harness({ caches });
  await assert.rejects(h.lifecycle("install"));
  assert.equal(h.skipped, 0);
  assert.equal(await caches.snapshot(), before);
});
test("同版本缓存 HTML 被改为另一合法构建时摘要拒绝并回退", async () => {
  const h = harness();
  await h.lifecycle("install");
  await seed(h.caches, "2.6.1");
  h.caches.maps.get(current).set(base + "index.html", resource("index.html", "2.7.0", "<!--非法替换-->"));
  h.handler = () => html("403", 403);
  assert.equal(await (await h.navigate()).text(), versioned("2.6.1"));
});
test("无缓存合法网络壳可返回，但不会单独写成完整离线安装", async () => {
  const h = harness();
  assert.equal(await (await h.navigate(base + "?sharecode=fixture-valid")).text(), versioned());
  assert.deepEqual(await h.caches.keys(), []);
});
test("只有他人缓存、未来缓存或不匹配版本缓存时不冒充可用", async () => {
  const caches = storage();
  await (await caches.open("another-app")).put(base + "index.html", resource("index.html"));
  await seed(caches, "2.8.0", { proof: true });
  await (await caches.open("shaozhu-v2.6.1")).put(base + "index.html", resource("index.html", "2.6.0"));
  const h = harness({ caches, fetch: () => { throw new TypeError("离线"); } });
  await unavailable(await h.navigate(), 503);
});
test("缓存图标离线返回，未知 API 与跨域、非 GET 不拦截", async () => {
  const h = harness();
  await h.lifecycle("install");
  h.handler = () => { throw new TypeError("离线"); };
  const event = h.dispatch(base + "icon-192.png", "cors");
  assert.deepEqual(Buffer.from(await (await event.response).arrayBuffer()), png["icon-192.png"]);
  for (const [url, mode, method] of [[base + "api", "navigate", "GET"], ["https://other.test/", "navigate", "GET"], [base, "navigate", "POST"]]) {
    assert.equal(h.dispatch(url, mode, method).response, undefined);
  }
});
test("manifest 网络恢复请求继承完整页面查询，不缓存返回值", async () => {
  const h = harness();
  const event = h.dispatch(base + "manifest.json", "cors");
  assert.equal((await event.response).status, 200);
  assert.equal(new URL(h.requests.at(-1).url).search, "?secret=fixture-secret&sharecode=fixture-code");
  assert.deepEqual(await h.caches.keys(), []);
});
test("重定向响应即使 200 也不得安装", async () => {
  const h = harness({ fetch: () => {
    const response = resource("index.html");
    Object.defineProperty(response, "redirected", { value: true });
    return response;
  } });
  await assert.rejects(h.lifecycle("install"));
  assert.equal(h.skipped, 0);
});
test("恢复页保留新完整链接且拒绝外域、脚本与其他路径，不接触记录", async () => {
  const h = harness({ fetch: () => html("拒绝", 403) });
  const original = base + "?secret=fixture-original&sharecode=fixture-code";
  const text = await (await h.navigate(original)).text();
  const elements = Object.fromEntries(["retry", "recover", "entry", "error"].map((id) => [id, { value: "", textContent: "" }]));
  let submit, assigned;
  elements.recover.addEventListener = (_, handler) => { submit = handler; };
  const location = { href: original + "#fixture-fragment", assign: (url) => { assigned = url; } };
  const context = vm.createContext({ URL, document: { getElementById: (id) => elements[id] }, location });
  Object.defineProperty(context, "localStorage", { get() { throw new Error("不得触碰记录"); } });
  vm.runInContext(text.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  assert.equal(elements.retry.href, location.href);
  const full = base + "index.html?secret=fixture-new&sharecode=fixture-fresh&extra=a%2Bb#fixture-end";
  elements.entry.value = full;
  submit({ preventDefault() {} });
  assert.equal(assigned, full);
  for (const invalid of ["https://another.test/", "javascript:alert(1)", "data:text/html,test", base + "other.html"]) {
    assigned = null;
    elements.entry.value = invalid;
    submit({ preventDefault() {} });
    assert.equal(assigned, null);
    assert.match(elements.error.textContent, /完整链接/);
  }
});

(async () => {
  let passed = 0;
  for (const [name, action] of tests) {
    try { await action(); passed++; console.log("通过 " + name); }
    catch (error) { console.error("失败 " + name + "\n" + error.stack); }
  }
  console.log(`离线可靠性测试：${passed} 通过 / ${tests.length - passed} 失败（共 ${tests.length} 项）`);
  if (passed !== tests.length) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
