// 家庭口令：新设备被拦、老设备放行、输对放行并记住、输错不放行
const fs=require('fs'),path=require('path');const {JSDOM}=require('jsdom');
const ROOT=path.join(__dirname,'../..');
let html=fs.readFileSync(path.join(ROOT,'少年主公.html'),'utf8');
const fnSrc=html.slice(html.indexOf('function gateHash('),html.indexOf('/* END:GATEFN */'));
const gateHash=new Function(fnSrc+';return gateHash;')();
const H=gateHash('test1234');
html=html.replace(/const GATE_HASH = "[0-9a-f]*";/,'const GATE_HASH = "'+H+'";');
let pass=0,fail=0;const t=(n,ok)=>{console.log((ok?'  ✅ ':'  ❌ ')+n);ok?pass++:fail++;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function open(pre){
  const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://x.test/',pretendToBeVisual:true,
    beforeParse(w){ w.confirm=()=>true; w.alert=()=>{}; if(pre) pre(w.localStorage); }});
  return dom;
}
(async()=>{
  let d=open(); await wait(300); let w=d.window;
  t('新设备看到口令页',!!w.document.getElementById('gate'));
  t('新设备没有建存档',w.localStorage.getItem('shaozhu_v1')===null);
  t('新设备主界面隐藏',w.document.querySelector('.app').style.display==='none');
  t('新设备主界面没有渲染内容',w.document.getElementById('main').innerHTML.trim()==='');
  w.document.getElementById('gateIn').value='wrong';w.document.getElementById('gateOk').click();
  t('输错不放行',w.localStorage.getItem('shaozhu_gate')===null && /不对/.test(w.document.getElementById('gateMsg').textContent));
  let reloaded=false; try{ w.location.reload=()=>{reloaded=true;}; }catch(e){}
  w.document.getElementById('gateIn').value=' test1234 ';w.document.getElementById('gateOk').click();
  t('输对后记住本设备',w.localStorage.getItem('shaozhu_gate')===H);
  d.window.close();
  d=open(ls=>ls.setItem('shaozhu_gate',H)); await wait(500); w=d.window;
  t('记住后再开不再问',!w.document.getElementById('gate') && w.document.getElementById('main').innerHTML.length>100);
  d.window.close();
  d=open(ls=>ls.setItem('shaozhu_v1',JSON.stringify({schema:8}))); await wait(500); w=d.window;
  t('已有存档的老设备自动放行（孩子手机不会被拦）',!w.document.getElementById('gate'));
  t('老设备同时被记住',w.localStorage.getItem('shaozhu_gate')===H);
  d.window.close();
  t('源码里没有口令明文',!fs.readFileSync(path.join(ROOT,'少年主公.html'),'utf8').includes('test1234'));
  console.log(`\n  口令测试：${pass} 通过 / ${fail} 失败`);process.exit(fail?1:0);
})();
