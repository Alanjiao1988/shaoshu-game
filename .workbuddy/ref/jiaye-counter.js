/* Cabinet & Three-Kingdoms World-Linked View. Copper never converts to study merit. */
let counterChoice={guest:"",quantity:null};
function counterQuantity(c){
  const max=Math.min(E.qty(state,c.item),c.count);
  if(counterChoice.guest!==c.id)counterChoice={guest:c.id,quantity:null};
  return max?Math.min(max,Math.max(1,counterChoice.quantity??max)):0;
}
function changeCounterQuantity(delta){
  const c=E.current(state);if(!c||state.phase!=="open")return;
  const max=Math.min(E.qty(state,c.item),c.count);if(!max)return;
  counterChoice={guest:c.id,quantity:Math.min(max,Math.max(1,counterQuantity(c)+delta))};
  render();
  const control=$("task").querySelector(`[data-action="saleqty"][data-delta="${delta}"]`);
  if(control&&!control.disabled)control.focus({preventScroll:true});
}
function pendingRelicHTML(){
  const r=E.RELIC_MAP[state.pendingRelic];
  if(!r)return "";
  const already=(state.relics||[]).includes(r.id);
  return `<span class="tag">封泥木匣 · 开出三国奇物</span><h2>${r.emoji} ${esc(r.name)}</h2><div class="counter-receipt"><p class="receipt-reply">${esc(r.era)} · 相关名将：${esc(r.hero)}</p><p>${esc(r.story)}</p><dl class="receipt-facts"><div><dt>西域富商当场出价</dt><dd>${r.sell}钱</dd></div><div class="receipt-margin"><dt>主公藏珍阁状态</dt><dd>${already?"阁中已藏":"尚未收入"}</dd></div></dl><p class="hint">${already?"藏珍阁已有此物，建议高价让予富商充实本钱！":"留下镇店将永久点亮《少年主公》主公藏珍阁；卖掉则立得大笔现钱备货抄底！"}</p></div><div class="task-actions">${!already?button("收入主公藏珍阁（永久镇店）","relic_keep",false,"primary full"):""}${button(`高价卖给富商，立收 ${r.sell} 钱`,"relic_sell",false,already?"primary full":"full")}</div>`;
}
function counterPrepHTML(){
  if(state.pendingRelic)return pendingRelicHTML();
  const plan=E.dayPlan(state),rumor=plan.rumor,bundle=plan.market.bundle,box=plan.market.box;
  const bp=E.PRODUCTS[bundle.item],l=state.lord||{chapter:1,rankLevel:0,rankName:"布衣",ownedCount:0};
  const tier=E.SHOP_TIERS[state.shopLevel||0],nextTier=E.SHOP_TIERS[(state.shopLevel||0)+1];
  const c=E.current(state);
  const stockLine=Object.values(E.PRODUCTS).filter(p=>state.day>=3||p.id!=="fan").map(p=>`${p.name}${E.qty(state,p.id)}${p.unit}`).join("、");
  const reserved=E.projectCost(state)?2:0;
  const canBundle=!state.bundleBought&&E.canPay(state,bundle.cost)&&E.allQty(state)+bundle.qty+reserved<=E.capacity(state);
  const canBox=!state.boxBought&&E.canPay(state,box.price)&&(box.kind!=="goods"||E.allQty(state)+3+reserved<=E.capacity(state));
  let rumorBlock="";
  if(state.day<=5){
    rumorBlock=`<section class="counter-request" aria-label="今日风向与备货"><p class="request-speaker">第${state.day}日 · ${esc(tier.name)}（主公官职：${esc(l.rankName)}）</p><p class="request-words">${esc(E.info(state).confirmed)}</p>${rumor.advisorHint?`<p class="lord-ally">🪶 ${esc(rumor.advisorHint)}</p>`:""}<p class="hint" style="margin:6px 0 0">货架已有：${stockLine}（${E.allQty(state)}/${E.capacity(state)}格）</p></section>`;
  }else{
    rumorBlock=`<section class="counter-request" aria-label="三国风声"><p class="request-speaker">📜 演义第${l.chapter}回风声 · ${esc(tier.name)}（官职：${esc(l.rankName)}）</p><p class="request-words">“${esc(rumor.text)}”</p>${rumor.advisorHint?`<p class="lord-ally">🪶 ${esc(rumor.advisorHint)}</p>`:`<p class="hint" style="margin:0 0 6px">（在招贤榜招募诸葛亮、郭嘉、周瑜等谋士，可替主公辨别风声虚实）</p>`}<p class="hint" style="margin:4px 0 0">关隘动向：${esc(plan.front.place)}正寻购军需 · 货架：${stockLine}（${E.allQty(state)}/${E.capacity(state)}格）</p></section>`;
  }
  const marketCards=`<div class="market-strip"><div class="market-card"><div><strong>🛒 早市整捆抄底</strong><p>${state.bundleBought?"今日整捆特惠已拿下":`急走货郎：${bundle.qty}${bp.unit}${bp.name}打包仅 <b>${bundle.cost}钱</b>（原进价${bundle.normalCost}钱）${bundle.merchant?` · 麾下${esc(bundle.merchant)}助谈省1钱`:""}`}</p></div>${button(state.bundleBought?"已抄底":`花${bundle.cost}钱全包`,"bundle",!canBundle,"small")}</div><div class="market-card"><div><strong>📦 封泥旧木匣（盲盒）</strong><p>${state.boxBought?"今日木匣已开鉴":`${esc(box.clue)}${box.warriorHint?`<br><span class="lord-ally-inline">⚔️ ${esc(box.warriorHint)}</span>`:""}`}</p></div>${button(state.boxBought?"已开匣":`花${box.price}钱淘匣`,"mystery",!canBox,"small")}</div></div>`;
  const notes=state.notes.length?`<div class="counter-status" role="status">${state.notes.slice(-2).map(x=>`<p>${esc(x)}</p>`).join("")}</div>`:"";
  const canUpgrade=nextTier&&l.rankLevel>=nextTier.minRank&&E.canPay(state,nextTier.cost);
  const upgradeBtn=nextTier?button(l.rankLevel>=nextTier.minRank?`晋升商号：${nextTier.name}（${nextTier.cost}钱）`:`商号升『${nextTier.name}』需主公升至${nextTier.rankName}`,"upgrade_shop",!canUpgrade,"quiet full"):"";
  return `<span class="tag">清晨早市 · 第${state.day}天</span><h2>听风声，逛早市备货</h2>${arrivalHTML()}${rumorBlock}${marketCards}${notes}<div class="task-actions">${button("平价货盘自选补货","purchase",false,c&&E.qty(state,c.item)<c.count&&!state.bundleBought?"primary full":"full")}${button("货备妥了，开门迎客","open",state.cash<2,c&&E.qty(state,c.item)<c.count&&!state.bundleBought?"full":"primary full")}${state.cash<2&&!state.worked?button("整理邻铺货物，挣4钱","work",false,"full"):""}${upgradeBtn}${button(`我的钱 / 藏珍阁（${(state.relics||[]).length}/${E.RELICS.length}）`,"relics_open",false,"quiet full")}</div>`;
}
function counterSaleHTML(c){
  if(state.pendingRelic)return pendingRelicHTML();
  const p=E.PRODUCTS[c.item],stock=E.qty(state,c.item),unitPay=c.vip?Math.max(state.prices[c.item],c.budget):state.prices[c.item],over=unitPay>c.budget;
  const tutorial=state.day===1&&state.cursor===0;
  const asked=state.day>1||state.asked.includes(c.id);
  const n=counterQuantity(c),canTrade=state.phase==="open"&&n>0&&!over;
  const notes=[];
  if(!asked)notes.push(tutorial?"第一笔先问清需求，再准备货物；现在不会扣货或收款。":"先确认这位来客的需求，再准备货物；现在不会扣货或收款。");
  else if(state.phase==="prep")notes.push("还没开门。备好货后确认开业，营业费在收摊时付一次。");
  if(!stock)notes.push(state.day===1?"货架上暂时没有这件货，可以先按需求进货。":"今天缺这件货。开门后不再补货，可以这次不成交，明天早市再提前筹备。");
  else if(stock<c.count)notes.push(`还差${c.count-stock}${p.unit}才能满足全部需求；也可以先交${n}${p.unit}，只按实际交货数量收款。`);
  if(over)notes.push(`现在每${p.unit}售价${state.prices[c.item]}钱，超过来客预算${c.budget}钱。可以查看售价后调整，或这次不成交。`);
  else if(c.vip&&asked)notes.push(`急采行情好价：来客愿按每${p.unit} ${unitPay}钱爽快收购！`);
  if(state.phase==="open"&&tutorial&&selected!==c.item&&stock)notes.push(`第一笔先选中${p.name}，再核对交货。`);
  const actions=[];
  if(!asked)actions.push(button("问清这一笔需求","ask",false,"primary full",attrs({id:c.id})));
  if(asked&&state.day===1&&stock<c.count)actions.push(button(`进货，准备${p.name}`,"purchase",false,stock?"full":"primary full"));
  if(state.phase==="prep"&&asked&&stock)actions.push(button("货备好了，确认开业","open",false,"primary full"));
  if(state.phase==="open"&&asked){
    if(tutorial&&selected!==c.item&&stock)actions.push(button(`选中货架上的${p.name}`,"select",false,"primary full",attrs({item:c.item})));
    else actions.push(button(n?`交${n}${p.unit}，收${n*unitPay}钱`:"暂时没有货可交","trade",!canTrade,"primary full",attrs({id:c.id,item:c.item,quantity:n})));
  }
  if(state.day>=3&&!c.vip)actions.push(button("查看售价与商品","details",false,"full",attrs({item:c.item})));
  actions.push(button("告诉来客：这次先不卖","pass",false,"quiet full",attrs({id:c.id})));
  return `<span class="tag">${state.phase==="prep"?"开门前":"营业中"} · 第${state.day}天${c.vip?" · 行情大单":""}</span><h2>柜台来客</h2><section class="counter-request" aria-label="当前来客需求"><p class="request-speaker">${esc(c.name)}来买东西</p><p class="request-words">“${esc(c.words)}”</p><dl class="counter-facts"><div><dt>想买</dt><dd>${c.count}${p.unit}${p.name}</dd></div><div><dt>货架上有</dt><dd>${stock}${p.unit}</dd></div><div><dt>${c.vip?"收购好价":"现在单价"}</dt><dd>${unitPay}钱<span> / ${p.unit}</span></dd></div><div><dt>来客每${p.unit}预算</dt><dd>${c.budget}钱</dd></div></dl>${state.phase==="open"&&asked&&n?`<div class="counter-quantity"><span>这次交货</span><div class="stepper">${button("−","saleqty",n<=1,"small",attrs({delta:-1})+' aria-label="减少交货数量"')}<output aria-live="polite">${n}${p.unit}</output>${button("＋","saleqty",n>=Math.min(stock,c.count),"small",attrs({delta:1})+' aria-label="增加交货数量"')}</div></div>`:""}<div class="counter-total"><span>${n?`交${n}${p.unit}${p.name} · 合计可收`:"没有可交的库存"}</span><strong>${n?n*unitPay:"—"}<small>${n?" 钱":""}</small></strong></div></section><div id="counter-status" class="counter-status${!stock||over?" warn":""}" role="status">${notes.map(note=>`<p>${esc(note)}</p>`).join("")||"核对数量和金额，再决定是否成交。"}</div><div class="task-actions">${actions.join("")}${canTrade&&!tutorial?'<p class="hint">点交货即成交，不再重复弹窗。</p>':""}</div>`;
}
function counterReceiptHTML(){
  const r=state.receipt,p=E.PRODUCTS[r.item];
  const reply=r.skipped?"那这次先不买了。":r.vip?"多谢掌柜救急，这批货正好解燃眉之急！":"货收好了，谢谢掌柜。";
  return `<span class="tag">交易小票</span><h2>${r.skipped?"这次没有成交":`这笔收到${r.income}钱`}</h2><div class="counter-receipt"><p class="receipt-reply">“${reply}”</p>${r.skipped?"<p>钱和货都没有改变。</p>":`<p>${esc(r.customer)}收下${r.quantity}${p.unit}${p.name}。</p><dl class="receipt-facts"><div><dt>收到货款</dt><dd>${r.income}钱</dd></div><div><dt>这批货的成本</dt><dd>${r.cost}钱</dd></div><div class="receipt-margin"><dt>这笔差价</dt><dd>${r.profit}钱</dd></div></dl><p class="hint">差价还没有扣今天的营业费。</p><details><summary>看这笔账怎么算</summary><p>${r.income}钱货款 − ${r.cost}钱成本 = ${r.profit}钱差价。</p><p>钱袋：${state.cash-r.income} → ${state.cash}钱。货款不是全部新赚的钱。</p></details>`}</div><div class="task-actions">${button(E.current(state)?"看看下一位来客的需求":"看看今天剩下什么","continue",false,"primary full")}${button("查看我的钱","money",false,"quiet full")}</div>`;
}
function counterSummaryCardHTML(){
  const r=state.report;if(!r)return "";
  const done=state.phase==="finished";
  const waste=r.rows.filter(x=>x.kind==="waste").map(x=>x.note).join(" ");
  const stockParts=Object.values(E.PRODUCTS).map(p=>[p,E.qty(state,p.id)]).filter(([,n])=>n>0).map(([p,n])=>`${p.name}${n}${p.unit}`).join("、");
  const tier=E.SHOP_TIERS[state.shopLevel||0];
  const relicCount=(state.relics||[]).length;
  const extra=[tier.name];
  if(relicCount)extra.push(`藏珍${relicCount}件`);
  if(E.principal(state))extra.push(`定期本金${E.principal(state)}钱`);
  if(E.projectCost(state))extra.push("合作扇2把待到货");
  let keyNote="";
  if(done){
    keyNote=`开张五日顺利结清！你可以带着现有的 ${state.cash}钱本钱、货架和藏珍直接开启第6天三国商路，越往后风声与奇物越丰富！`;
  }else{
    keyNote=waste?"今天有没卖完的饼食按规则清理了，明天早市先看准三国风声再出手。":"收好账目，明天清晨早市会刷新新的三国风声与封泥木匣。";
  }
  return `<span class="tag">${done?"五日初成 · 可无缝续营":"第"+state.day+"天收摊"}</span><h2>${done?"这五天的账，结清楚了":"今天收摊，盘一盘店里"}</h2><div class="counter-receipt"><dl class="receipt-facts"><div><dt>现在手头现钱</dt><dd>${state.cash}钱</dd></div><div><dt>${done?"货架余货":"今天收到货款"}</dt><dd>${done?(stockParts||"无余货"):(r.sales+"钱")}</dd></div><div class="receipt-margin"><dt>${done?"本轮开店本金":"今天营业费"}</dt><dd>${done?"50钱":(r.opened?"2钱":"未开业 0钱")}</dd></div></dl><p class="hint">商号现状：${extra.join(" · ")}${!done?` · 余货：${stockParts||"空"}（进价${E.inventoryCost(state)}钱）`:""}</p><p style="margin:8px 0 0;font-size:13.5px;line-height:1.6">${esc(keyNote)}</p><details><summary>看完整账目说明</summary><p>今日现钱：${r.cashStart} → ${r.cash}钱。进货、淘木匣、扩建商号都会改变现钱。</p><p>今日账面净值变化 ${r.change>=0?"+"+r.change:r.change}钱。${esc(waste)}</p></details></div><div class="task-actions">${done?button("带着全部家底，继续闯荡第6天 →","continue_beyond",false,"primary full")+button("翻看账本与藏珍阁","relics_open",false,"full")+button("从第1天重新开局","restart",false,"quiet full"):button("进入第"+(state.day+1)+"天早市","next",false,"primary full")+button("查看我的钱与商号","money",false,"full")}</div>`;
}
function relicsPanelHTML(){
  const owned=new Set(state.relics||[]),l=state.lord||{chapter:1,rankLevel:0,rankName:"布衣",ownedCount:0,advisors:[],merchants:[],warriors:[]};
  const tier=E.SHOP_TIERS[state.shopLevel||0],nextTier=E.SHOP_TIERS[(state.shopLevel||0)+1];
  const canUpgrade=nextTier&&l.rankLevel>=nextTier.minRank&&E.canPay(state,nextTier.cost)&&["prep","summary"].includes(state.phase);
  let out=`<div class="finance-visual"><section class="card" style="margin-top:0"><h3>🏯 主公联动加成（只读赋能 · 铜钱不换军功）</h3><p class="hint">演义进度：第 <b>${l.chapter}</b> 回 · 主公官职：<b>${esc(l.rankName)}</b> · 麾下名将：<b>${l.ownedCount}</b> 位</p><p class="hint">谋士辨风声：${l.advisors.length?l.advisors.map(esc).join("、"):"暂未招募（诸葛亮/郭嘉/荀彧/周瑜等）"}<br>富商助砍价：${l.merchants.length?l.merchants.map(esc).join("、"):"暂未招募（糜竺/鲁肃/顾雍等）"}<br>猛将掌眼力：${l.warriors.length?l.warriors.map(esc).join("、"):"暂未招募（关羽/赵云/张辽/吕布等）"}</p><p style="margin-top:8px">当前商号：<b>${esc(tier.name)}</b>（${esc(tier.desc)}）</p>${nextTier?`<p class="hint">下一级『${esc(nextTier.name)}』：需官职达「${esc(nextTier.rankName)}」且花 ${nextTier.cost}钱（${esc(nextTier.desc)}）</p>${button(`扩建为${nextTier.name}（${nextTier.cost}钱）`,"upgrade_shop",!canUpgrade,"small")}`:"<p class=\"hint\">已达最高规格九州通商号！</p>"}</section><h3>🏺 主公藏珍阁（已收 ${owned.size} / ${E.RELICS.length} 件）</h3><p class="hint">每天清晨早市淘『封泥旧木匣』有机会鉴定出三国名物，留下镇店即永久载入主公藏珍阁。</p><div class="grid two" style="margin-top:10px">${E.RELICS.map(r=>{const got=owned.has(r.id);return `<section class="card" style="margin:0;opacity:${got?1:.68}"><h3>${got?r.emoji:"🔒"} ${got?esc(r.name):"未鉴出名物"}</h3><p class="hint">${esc(r.era)} · ${got?`关联名将：${esc(r.hero)}`:"早市封泥木匣可淘得"}</p><p style="font-size:13px;margin:4px 0 0">${got?esc(r.story):`线索：${esc(r.clue)}`}</p></section>`;}).join("")}</div><div class="actions">${button("返回店铺","panelclose",false,"primary")}</div></div>`;
  return out;
}
function openRelicsPanel(){
  panel("主公商号与藏珍阁",relicsPanelHTML(),"relics");
}
function syncFromParentLord(raw){
  if(!raw||typeof raw!=="object")return;
  try{
    const cur=state.lord||{};
    const nextAction={
      type:"synclord",
      chapter:Math.max(1,Math.min(120,Number(raw.chapter)||1)),
      rankLevel:Math.max(0,Math.min(8,Number(raw.rankLevel)||0)),
      rankName:String(raw.rankName||"布衣").slice(0,10),
      bossIndex:Math.max(0,Math.min(6,Number(raw.bossIndex)||0)),
      ownedCount:Math.max(0,Math.min(160,Number(raw.ownedCount)||0)),
      advisors:Array.isArray(raw.advisors)?raw.advisors.filter(x=>E.ADVISORS.includes(x)).slice(0,5):[],
      merchants:Array.isArray(raw.merchants)?raw.merchants.filter(x=>E.MERCHANTS.includes(x)).slice(0,5):[],
      warriors:Array.isArray(raw.warriors)?raw.warriors.filter(x=>E.WARRIORS.includes(x)).slice(0,5):[]
    };
    const same=cur.chapter===nextAction.chapter&&cur.rankLevel===nextAction.rankLevel&&cur.bossIndex===nextAction.bossIndex&&JSON.stringify(cur.advisors)===JSON.stringify(nextAction.advisors)&&JSON.stringify(cur.merchants)===JSON.stringify(nextAction.merchants)&&JSON.stringify(cur.warriors)===JSON.stringify(nextAction.warriors);
    if(same)return;
    const clean=S.cleanAction(nextAction),nextState=E.step(state,clean);
    state=nextState;
    if(actions.length&&actions[actions.length-1].type==="synclord")actions[actions.length-1]=clean;
    else if(actions.length>0)actions.push(clean);
    if(!resume&&actions.length>0&&!temporary)persist();
    render();
  }catch(e){}
}
function renderScene(c,gated,action){
  const previous=sceneQuantities;sceneQuantities={};
  const tier=E.SHOP_TIERS[state.shopLevel||0];
  $("shelves").innerHTML=Object.values(E.PRODUCTS).map(p=>{const n=E.qty(state,p.id),locked=p.id==="fan"&&state.day<3;sceneQuantities[p.id]=n;const cols=n>6?6:n>3?4:3,rows=Math.max(1,Math.ceil(n/cols)),w=p.id==="fan"?(rows>1?14:22):(rows>1?19:25);const images=Array.from({length:n},(_,i)=>{const col=i%cols,row=Math.floor(i/cols),left=4+col*(cols===6?14:cols===4?20:28),bottom=8+((rows-1-row)*31)+col*(p.id==="bread"?1:2);return `<img class="stock-art ${previous&&i>=previous[p.id]?"gain":""}" src="${ART[p.id]}" alt="" aria-hidden="true" style="left:${left}%;bottom:${bottom}%;width:${w}%">`;}).join("");return `<button class="shelf ${selected===p.id?"chosen":""} ${!n?"empty":""} ${locked?"locked":""}" data-action="select" data-item="${p.id}" data-stock="${n}" ${gated||locked?"disabled":""} aria-label="${p.name}，库存${n}${p.unit}，售价${state.prices[p.id]}铜钱" aria-pressed="${selected===p.id}"><span class="shelf-cost">${locked?"第3天介绍":"售 "+state.prices[p.id]}</span><span class="goods">${images}</span><span class="shelf-label">${p.name} ${locked?"· 待介绍":`×${n}`}</span></button>`;}).join("");
  $("scene-caption").textContent=`${tier.name} · 货架 ${E.allQty(state)}/${E.capacity(state)} · 藏珍 ${(state.relics||[]).length}/${E.RELICS.length}`;
  const phases={welcome:"自己的小铺，从一笔生意开始",prep:"早市听风声，抄底淘奇物",open:"看需求，自己决定怎么卖",receipt:"这一笔，钱和货都记清楚",summary:"收好今天的账",finished:"五日初成，可带家底续闯三国"};
  $("step-title").textContent=resume?"欢迎回来，原进度还在。":phases[state.phase];
  $("step-note").textContent=state.phase==="receipt"?"收钱不等于全是利润，详细账目随时可以看。":state.phase==="summary"?"要不要进入下一天，由你决定。":"随时可以暂停，离开不扣钱、不坏货。";
  if(action&&action.type==="trade"&&state.receipt&&!state.receipt.skipped){const img=document.createElement("img");img.src=ART[state.receipt.item];img.className="flying-item "+state.receipt.item;img.alt="";$("motion-layer").replaceChildren(img);setTimeout(()=>img.remove(),750);}
}
