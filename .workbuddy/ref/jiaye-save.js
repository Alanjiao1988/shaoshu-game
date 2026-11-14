(function(root,factory){if(typeof module==="object"&&module.exports)module.exports=factory();else root.SeasonSave=factory();})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const KEY="shaozhu_jiaye_child_v7",MAX_ACTIONS=2000,MAX_BYTES=350000,DEFAULT_UI={moneyTab:"overview"};
function check(c,m){if(!c)throw new Error(m);}
function plain(o){return o!==null&&typeof o==="object"&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;}
function exact(o,keys){check(plain(o)&&Object.keys(o).every(k=>keys.includes(k)),"存档字段不能识别。");}
function cleanStringList(v){check(Array.isArray(v)&&v.length<=5&&v.every(x=>typeof x==="string"&&x.length>=1&&x.length<=10),"名将列表无效。");return v.slice();}
function cleanAction(a){
  const fields={
    begin:[],next:[],continue_beyond:[],
    ask:["id"],buy:["item","quantity"],bundle:[],mystery:[],
    relic_choice:["choice"],upgrade_shop:[],inherit_relics:["ids"],
    synclord:["chapter","rankLevel","rankName","bossIndex","advisors","merchants","warriors","ownedCount"],
    price:["item","price"],open:[],trade:["id","item","quantity"],pass:["id"],continue:[],close:[],
    deposit:["amount","term"],withdraw:["id"],invest:[],clear:["quantity"],shelf:[],work:[]
  };
  check(plain(a)&&typeof a.type==="string"&&Object.hasOwn(fields,a.type),"未知行动。");
  exact(a,["type",...fields[a.type]]);
  for(const field of fields[a.type])check(Object.hasOwn(a,field),"行动记录不完整。");
  if(Object.hasOwn(a,"item"))check(["bread","rope","fan"].includes(a.item),"商品无效。");
  if(Object.hasOwn(a,"quantity"))check(Number.isInteger(a.quantity)&&a.quantity>=1&&a.quantity<=6,"数量无效。");
  if(Object.hasOwn(a,"price"))check([3,4,5,6,8,9].includes(a.price),"售价无效。");
  if(a.type==="ask"||a.type==="trade"||a.type==="pass")check(typeof a.id==="string"&&/^d\d{1,3}-[a-z0-9]+$/.test(a.id),"顾客标记无效。");
  if(a.type==="withdraw")check(Number.isSafeInteger(a.id)&&a.id>=1&&a.id<=200,"存款标记无效。");
  if(a.type==="deposit")check([20,40].includes(a.amount)&&[1,2].includes(a.term),"存期无效。");
  if(a.type==="relic_choice")check(["keep","sell"].includes(a.choice),"奇物处置选项无效。");
  if(a.type==="inherit_relics")check(Array.isArray(a.ids)&&a.ids.length<=20&&a.ids.every(x=>typeof x==="string"&&/^[a-z]{3,15}$/.test(x)),"传承奇物列表无效。");
  if(a.type==="synclord"){
    check(Number.isInteger(a.chapter)&&a.chapter>=1&&a.chapter<=120,"回目无效。");
    check(Number.isInteger(a.rankLevel)&&a.rankLevel>=0&&a.rankLevel<=8,"官职等级无效。");
    check(typeof a.rankName==="string"&&a.rankName.length>=1&&a.rankName.length<=10,"官职名称无效。");
    check(Number.isInteger(a.bossIndex)&&a.bossIndex>=0&&a.bossIndex<=6,"关隘索引无效。");
    check(Number.isInteger(a.ownedCount)&&a.ownedCount>=0&&a.ownedCount<=160,"名将数量无效。");
    cleanStringList(a.advisors);cleanStringList(a.merchants);cleanStringList(a.warriors);
  }
  return JSON.parse(JSON.stringify(a));
}
function restore(raw,E){
  check(typeof raw==="string"&&raw.length<=MAX_BYTES,"存档过大。");
  const v=JSON.parse(raw);
  exact(v,["format","seed","actions","ui"]);
  check(v.format===7&&Number.isSafeInteger(v.seed)&&Math.abs(v.seed)<=1000000,"版本不符，原档会保留。");
  check(Array.isArray(v.actions)&&v.actions.length<=MAX_ACTIONS,"行动数量无效。");
  exact(v.ui,["moneyTab"]);
  check(["overview","saving","investment","ledger"].includes(v.ui.moneyTab),"界面状态无效。");
  const actions=v.actions.map(cleanAction);
  let state=E.initial(v.seed);
  for(const a of actions)state=E.step(state,a);
  E.validate(state);
  return{state,actions,ui:{...v.ui}};
}
function encode(seed,actions,ui,E){
  const text=JSON.stringify({format:7,seed,actions,ui});
  restore(text,E);
  return text;
}
function controller(storage,E){
  let last=null,blocked=false;
  function load(){
    try{
      const raw=storage.getItem(KEY);last=raw;
      if(raw===null)return{kind:"empty"};
      try{return{kind:"valid",data:restore(raw,E)};}
      catch(e){blocked=true;return{kind:"invalid",message:"本机进度无法完整恢复，原档没有删除或覆盖。"};}
    }catch(e){blocked=true;return{kind:"unavailable",message:"这个浏览器禁止保存，可以临时玩，刷新可能丢进度。"};}
  }
  function save(seed,actions,ui,replace=false){
    try{
      if(blocked&&!replace)return{ok:false,message:"临时游玩 · 原档未覆盖"};
      if(storage.getItem(KEY)!==last)return{ok:false,message:"另一页更新了进度，已停止写入。请只保留一页并刷新。"};
      const text=encode(seed,actions,ui,E);
      storage.setItem(KEY,text);last=text;blocked=false;
      return{ok:true,message:"已存到本机 · 单页面使用"};
    }catch(e){return{ok:false,message:"本次未保存 · 可以继续玩，刷新可能丢进度"};}
  }
  return{load,save};
}
return{KEY,MAX_ACTIONS,DEFAULT_UI,cleanAction,restore,encode,controller};
});
