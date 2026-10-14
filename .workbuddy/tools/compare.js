/* 对比 App 现有 36 位与怀沙实体卡 160 张（临时分析脚本） */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "少年主公.html"), "utf8");

const block = html.match(/const HEROES = \{([\s\S]*?)\n\};/)[1];
const app = { legend: [], rare: [], common: [] };
let cur = null;
for (const line of block.split("\n")) {
  const m = line.match(/^\s*(legend|rare|common):\s*\[/);
  if (m) { cur = m[1]; continue; }
  const n = line.match(/n:"([^"]+)"/);
  if (n && cur) app[cur].push(n[1]);
}
const appAll = [...app.legend, ...app.rare, ...app.common];

const hyg = JSON.parse(fs.readFileSync(path.join(ROOT, ".workbuddy", "ref", "怀沙武将卡160.json"), "utf8")).cards;
const hygNames = hyg.map(x => x[2]);

const both = appAll.filter(n => hygNames.includes(n));
const appOnly = appAll.filter(n => !hygNames.includes(n));
const hygOnly = hyg.filter(x => !appAll.includes(x[2]));

console.log(`App 现有 ${appAll.length} 位 / 实体卡 ${hyg.length} 张\n`);
console.log(`★ 两边都有（${both.length} 位）：`);
console.log("   " + both.join("、"));
console.log(`\n✗ App 有、实体卡里没有（${appOnly.length} 位）：`);
console.log("   " + appOnly.join("、"));
console.log(`\n实体卡有、App 没有：${hygOnly.length} 张`);

console.log("\n其中 A 档及以上（值得补进图鉴的）：");
for (const t of ["SS", "S+", "S", "A+", "A"]) {
  const g = hygOnly.filter(x => x[3] === t);
  if (g.length) console.log(`   ${t.padEnd(3)} ${String(g.length).padStart(2)} 位  ${g.map(x => x[2]).join("、")}`);
}

// App 现有 36 位在实体卡里的等级
console.log("\nApp 现有 36 位在实体卡里的等级：");
const tiers = { legend: "神将", rare: "名将", common: "良将" };
for (const t of ["legend", "rare", "common"]) {
  const rows = app[t].map(n => {
    const h = hyg.find(x => x[2] === n);
    return `${n}(${h ? h[3] : "—"})`;
  });
  console.log(`   ${tiers[t]}：${rows.join(" ")}`);
}

// 关键冲突：App 定为神将、实体卡却是低档的
console.log("\n⚠️ 档位冲突（App 是高档、实体卡是低档）：");
for (const n of app.legend.concat(app.rare)) {
  const h = hyg.find(x => x[2] === n);
  if (h && ["B+", "B", "B-"].includes(h[3])) {
    console.log(`   ${n}：App 是${app.legend.includes(n) ? "神将" : "名将"}，实体卡等级只有 ${h[3]}`);
  }
}
