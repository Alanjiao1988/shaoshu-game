/* 从 heroes.json 生成 HERO_DATA 数组，注入 少年主公.html 的标记之间
   用法：node .workbuddy/tools/buildheroes.js */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const FILE = path.join(ROOT, "少年主公.html");
const data = JSON.parse(fs.readFileSync(path.join(ROOT, ".workbuddy", "ref", "heroes.json"), "utf8"));

const esc = s => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
// 纹章用的「姓氏」：复姓取整个复姓，单姓取首字
const COMPOUND = ["公孙","夏侯","司马","诸葛","皇甫","淳于","太史","令狐","呼延","慕容","宇文","长孙","尉迟","单于","万俟","闻人","东方","赫连","澹台","公治","宗政","濮阳","淳于","单于","太叔","申屠","公仲","壤驷","公良","夹谷","宰父","谷粱","段干","百里","东郭","南门","羊舌","微生","公西","南门"];
function surnameOf(n){
  for(const c of COMPOUND) if(n.startsWith(c)) return c;
  return n.slice(0,1);
}
// 每行一位：["姓名","阵营","等级","图标","一句话","纹章姓氏","字","名场面回目"]
const lines = data.heroes.map(h => {
  const s = surnameOf(h.n);
  return `  ["${esc(h.n)}","${esc(h.f)}","${esc(h.g)}","${esc(h.e)}","${esc(h.d)}","${esc(s)}","${esc(h.z||"")}",${Number(h.c)||0}]`;
});
const literal = "const HERO_DATA = [\n" + lines.join(",\n") + "\n];";

let html = fs.readFileSync(FILE, "utf8");
const A = "/* BUILD:HERO_DATA:START */";
const B = "/* BUILD:HERO_DATA:END */";
const i0 = html.indexOf(A), i1 = html.indexOf(B);
if (i0 < 0 || i1 < 0) { console.error("❌ 找不到 BUILD:HERO_DATA 标记"); process.exit(1); }
html = html.slice(0, i0 + A.length) + "\n" + literal + "\n" + html.slice(i1);
fs.writeFileSync(FILE, html, "utf8");

// 自检
const f = {};
for (const h of data.heroes) f[h.f] = (f[h.f] || 0) + 1;
console.log(`✅ 已注入 ${data.heroes.length} 位武将`);
console.log("   阵营：" + Object.entries(f).map(([k, v]) => `${k} ${v}`).join(" / "));
const size = fs.statSync(FILE).size;
console.log(`   主文件现在 ${Math.round(size / 1024)} KB`);
