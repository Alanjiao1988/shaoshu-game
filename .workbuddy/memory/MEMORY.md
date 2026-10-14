# 项目长期记忆

## 项目：《少年主公》儿童学习管理工具（单文件 HTML）

工作区：`C:/Users/ianji/WorkBuddy/2026-10-12-15-20-18/`
产物：`少年主公.html`（单文件、零依赖、离线可用、localStorage key `shaozhu_v1`）

### 用户已明确的决策
1. **不做主题引擎** —— 直接就是三国版，不要可切换主题的架构（原童话版 `学习冒险岛.html` 已按用户要求删除）
2. **武将卡做图鉴收集** —— 不做上阵/羁绊等数值系统
3. **使用者是小学高年级（5-6 年级）** —— 可以直接用《三国演义》原回目
4. **设计方向：强驱动（"推着孩子走"）** —— 不是"陪着孩子看"。用户明确选择了强外在激励路线。做取舍时以"能不能推得动"为优先，而不是"会不会打扰"。

### 由决策 4 推导出的设计原则
- **区分「助推」与「驱动」**：助推（让下一步更清晰、反馈更密）无副作用；驱动（不做就没奖励）会反噬，必须配保险
- **抽卡保底是必须项**，不是可选项 —— 强驱动下挫败感会摧毁驱动力
- **必须做退场机制**：连续 4 周 100% 完成的任务应自动"毕业"移入荣誉墙。推着走的终点是孩子自己走，不能设计成永久依赖
- 警惕过度理由效应：五年级孩子能识破"这套是骗我学习的"

### 仍在待办的关键缺陷（截至 2026-10-12，均未修复）
- **账目冻结**（最高优先级）：奖励目前是"实时重算"而非"记账"，导致已得招贤令被追溯撤销、军功倒退、官职掉级、历史被改写。详见当日日志
- 家长诊断视图、目标层、记录沉淀（跨周曲线）、数据自动备份

### 用户沟通偏好
- 追问深度：第一次给出的建议被评价为「远远不够」，用户要求更结构性的分析而非功能清单
- 反感"打补丁式"罗列，接受"承认前期判断偏差 + 重新定位"式的回答
- 会明确说「先不做任何修改」，此时只分析、不动代码
- 会直接说「要加」「同步和备份」这类短语表示开工，不必反复确认

### 工程约定（每次改动照做）
- **改完必须跑**：`node .workbuddy/tests/logic.js` 和 `node .workbuddy/tests/ui.js`（已常驻，别重写）
- **同步线上**：`cp 少年主公.html site/index.html` → 改 `site/sw.js` 的 `VERSION` → **先 curl 抓一份线上存档** → `workbuddy_sites_deploy` 传 `directory=.../site` + `userAskedToPublish: true`（**每轮都要用户当轮明确同意**）
- **发布后验证**：curl 查版本号、sw.js 可达、与本地 `diff` 一致
- 源码只改 `少年主公.html`；`site/` 是发布副本，不要直接改

### Git / GitHub

- **仓库**：`https://github.com/Alanjiao1988/shaoshu-game.git`（私有，分支 `main`）
  - 用户名首字母**大写**：`Alanjiao1988`（git 全局配置里的 `user.name` 是小写 `alanjiao1988`，GitHub 实际显示名是大写）
  - 仓库名是 **shaoshu-game**（不是 shaozhu —— 这两个字母容易读反，用户自己也输错过一次）
- **推送脚本**：`bash .workbuddy/tools/push_github.sh <仓库地址>`（幂等）
- ⚠️ **推送必须关掉沙箱**：Git Credential Manager 的浏览器登录要在本地起一个 `HttpListener` 接 OAuth 回调，沙箱里会直接 `System.AccessViolationException` 崩溃。用 `dangerouslyDisableSandbox: true` 跑。
- 凭据已由 GCM 存好（账号 `Alanjiao1988`），后续推送不会再弹浏览器
- 仓库里保留了 GitHub 建仓时自动生成的 README.md（一行），我的提交 rebase 在它上面，**没有强推**

## 关键限制（别踩）
- iOS Safari 的 **ITP 7 天规则**会清空 localStorage；**「添加到主屏幕」豁免**，且其存储与 Safari **隔离**
- **Chrome 在 `file://` 下 localStorage 可用**（实测），所以本地桌面版可行
- 沙箱**禁止执行 cscript / wscript / WScript.Shell COM / taskkill**，WSH 脚本只能靠审读 + 编码正确来保证
- 写 `.vbs` 必须 **UTF-16LE + BOM**，否则中文乱码
- **无头 Chrome 必须加 `--disable-background-mode`**，否则进程不退、profile 目录删不掉、越积越多
- **无头 Chrome 的 profile 不能用 `os.tmpdir()`** —— 沙箱里 Node 能写临时目录，Chrome 不行（表现为 0 个 page target）
- **CDP 调试端口必须先探测是否空闲**，不能只靠随机 —— 残留 Chrome 会占端口，导致 CDP 连到旧浏览器

### 工具链（都在 `.workbuddy/`）
- `tests/logic.js` — 逻辑测试 92 项（vm 沙箱，无浏览器）
- `tests/ui.js` — 浏览器测试 23 项 + 截图（`tests/shots/`）
- `tools/makeicon.js` — 生成全部图标尺寸（含 maskable）
- `tools/buildheroes.js` — 从 `ref/heroes.json` 生成 `HERO_DATA` 注入 HTML
- `tools/checkheroes.js` — 校验武将库与怀沙实体卡核对表是否一一对应
- `tools/compare.js` — 对比 App 人选与实体卡名单
- `ref/heroes.json` — 武将库数据源（160 位）
- `ref/怀沙武将卡160.json` — 实体卡核对表原始转录
- `backup/` — 线上版本的历次回退存档

### 武将库（v1.7.0 起）
- **160 位，对应「怀沙三国英雄之旅」实体武将卡**，阵营 汉/魏/蜀/吴（群雄并入汉）
- 等级 SS/S+/S/A+/A/B+/B/B- → 档位 神将(17)/名将(31)/良将(112)
- **档位 = 实体卡的武力等级**（不是稀有度）。曾提议 52 位折中方案，用户明确选择「直接160」，**并确认维持 160 不切 52** —— 目的是孩子手上任意一张实体卡都能在 App 里找到对应的人
- **改武将库的正确姿势**：改 `ref/heroes.json` → 跑 `buildheroes.js` → 跑 `checkheroes.js` → 跑两套测试
- **不要手改 HTML 里 `BUILD:HERO_DATA` 标记之间的数组**
- 卡 81 已确认是**穆顺**（不是糜顺），数据源与原始转录均已修正
