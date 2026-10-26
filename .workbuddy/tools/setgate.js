// 设置/更换家庭口令：node .workbuddy/tools/setgate.js <口令>
// 空参数 = 关闭口令。只把哈希写进 HTML，明文不落盘。
const fs=require('fs'),path=require('path');
const F=path.join(__dirname,'../../少年主公.html');
let s=fs.readFileSync(F,'utf8');
const code=process.argv[2]||"";
const fnSrc=s.slice(s.indexOf('function gateHash('),s.indexOf('/* END:GATEFN */'));
const gateHash=new Function(fnSrc+';return gateHash;')();
const h=code?gateHash(code):"";
const re=/\/\* BUILD:GATE \*\/const GATE_HASH = "[0-9a-f]*";\/\* END:GATE \*\//;
if(!re.test(s)) throw new Error('找不到 BUILD:GATE 标记');
s=s.replace(re,'/* BUILD:GATE */const GATE_HASH = "'+h+'";/* END:GATE */');
fs.writeFileSync(F,s);
console.log(code?'家庭口令已设置（哈希 '+h+'）':'家庭口令已关闭');
