/* 校验 heroes.json 与怀沙核对表是否完全一致（人数、姓名、阵营、等级） */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const ref = JSON.parse(fs.readFileSync(path.join(ROOT, ".workbuddy", "ref", "怀沙武将卡160.json"), "utf8")).cards;
const mine = JSON.parse(fs.readFileSync(path.join(ROOT, ".workbuddy", "ref", "heroes.json"), "utf8")).heroes;

console.log(`核对表 ${ref.length} 张 / heroes.json ${mine.length} 位`);

const rk = ref.map(x => x[2]);
const mk = mine.map(x => x.n);
const miss = rk.filter(n => !mk.includes(n));
const extra = mk.filter(n => !rk.includes(n));
console.log(`\n漏掉的  ${miss.length} 位: ${miss.join("、") || "无"}`);
console.log(`多出的  ${extra.length} 位: ${extra.join("、") || "无"}`);

console.log("\n字段不一致：");
let bad = 0;
for (const r of ref) {
  const m = mine.find(x => x.n === r[2]);
  if (!m) continue;
  if (m.f !== r[1]) { console.log(`  ${r[2]}: 阵营 核对表=${r[1]} vs 我的=${m.f}`); bad++; }
  if (m.g !== r[3]) { console.log(`  ${r[2]}: 等级 核对表=${r[3]} vs 我的=${m.g}`); bad++; }
}
console.log(bad ? `  共 ${bad} 处` : "  无");

// 重复名检查
const dup = mk.filter((n, i) => mk.indexOf(n) !== i);
console.log("\n重名:", dup.length ? dup.join("、") : "无");

// 缺图标/描述
const noE = mine.filter(x => !x.e || !x.d || !x.n || !x.f || !x.g);
console.log("字段缺失:", noE.length ? noE.map(x => x.n).join("、") : "无");

// 档位分布
const MAP = { "SS":"神将","S+":"神将","S":"神将","A+":"名将","A":"名将","B+":"良将","B":"良将","B-":"良将" };
const t = {};
for (const x of mine) { const k = MAP[x.g]; t[k] = (t[k] || 0) + 1; }
console.log("\n档位分布（按等级映射）:");
for (const k of ["神将", "名将", "良将"]) console.log(`  ${k}: ${t[k] || 0} 位`);

const f = {};
for (const x of mine) f[x.f] = (f[x.f] || 0) + 1;
console.log("\n阵营分布:", Object.entries(f).map(([k, v]) => `${k} ${v}`).join(" / "));

// 等级分布
const g = {};
for (const x of mine) g[x.g] = (g[x.g] || 0) + 1;
console.log("等级分布:", ["SS","S+","S","A+","A","B+","B","B-"].map(k => `${k} ${g[k] || 0}`).join(" / "));

process.exit(miss.length + extra.length + bad + dup.length + noE.length ? 1 : 0);
