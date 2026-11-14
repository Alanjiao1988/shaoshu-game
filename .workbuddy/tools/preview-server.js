"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SITE = path.join(ROOT, "site");
const OUTPUTS = path.join(ROOT, "outputs");
const PORT = Number(process.env.PORT || 8773);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendFile(res, filePath, extraHeaders = {}) {
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(fs.readFileSync(filePath));
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const appVer = fs.readFileSync(path.join(ROOT, "少年主公.html"), "utf8").match(/const APP_VERSION = "([^"]+)";/)?.[1] || "2.6.8";
  const fullPreview = path.join(OUTPUTS, `少年主公_iPad横屏完整试玩_v${appVer}.html`);
  const shopPreview = path.join(OUTPUTS, `少年掌柜_本地试玩_v${appVer}.html`);

  if (urlPath === "/" || urlPath === "/preview") {
    if (fs.existsSync(fullPreview)) return sendFile(res, fullPreview);
  }
  if (urlPath === "/shop") {
    if (fs.existsSync(shopPreview)) return sendFile(res, shopPreview);
  }
  if (urlPath === "/app" || urlPath === "/index.html") {
    return sendFile(res, path.join(SITE, "index.html"));
  }
  const siteTarget = path.resolve(SITE, urlPath.replace(/^\//, ""));
  if (siteTarget.startsWith(SITE) && fs.existsSync(siteTarget) && fs.statSync(siteTarget).isFile()) {
    return sendFile(res, siteTarget, { "Service-Worker-Allowed": "/" });
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Preview server listening at http://127.0.0.1:${PORT}/`);
});
