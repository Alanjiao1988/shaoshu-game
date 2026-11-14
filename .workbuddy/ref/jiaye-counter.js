/* Cabinet view only. Engine, cash rules, save format and clock are unchanged. */
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
function counterSaleHTML(c){
  const p=E.PRODUCTS[c.item],stock=E.qty(state,c.item),price=state.prices[c.item],over=price>c.budget;
  const tutorial=state.day===1&&state.cursor===0;
  const asked=state.day>1||state.asked.includes(c.id);
  const n=counterQuantity(c),canTrade=state.phase==="open"&&n>0&&!over;
  const notes=[];
  if(!asked)notes.push(tutorial?"第一笔先问清需求，再准备货物；现在不会扣货或收款。":"先确认这位来客的需求，再准备货物；现在不会扣货或收款。");
  else if(state.phase==="prep")notes.push("还没开门。备好货后确认开业，营业费在收摊时付一次。");
  if(!stock)notes.push(state.day===1?"货架上暂时没有这件货，可以先按需求进货。":"今天缺这件货。开门后不再补货，可以这次不成交，明天再安排。");
  else if(stock<c.count)notes.push(`还差${c.count-stock}${p.unit}才能满足全部需求；也可以先交${n}${p.unit}，只按实际交货数量收款。`);
  if(over)notes.push(`现在每${p.unit}售价${price}钱，超过来客预算${c.budget}钱。可以查看售价后调整，或这次不成交。`);
  if(state.phase==="open"&&tutorial&&selected!==c.item&&stock)notes.push(`第一笔先选中${p.name}，再核对交货。`);
  const actions=[];
  if(!asked)actions.push(button("问清这一笔需求","ask",false,"primary full",attrs({id:c.id})));
  if(asked&&state.day===1&&stock<c.count)actions.push(button(`进货，准备${p.name}`,"purchase",false,stock?"full":"primary full"));
  if(state.phase==="prep"&&asked&&stock)actions.push(button("货备好了，确认开业","open",false,"primary full"));
  if(state.phase==="open"&&asked){
    if(tutorial&&selected!==c.item&&stock)actions.push(button(`选中货架上的${p.name}`,"select",false,"primary full",attrs({item:c.item})));
    else actions.push(button(n?`交${n}${p.unit}，收${n*price}钱`:"暂时没有货可交","trade",!canTrade,"primary full",attrs({id:c.id,item:c.item,quantity:n})));
  }
  if(state.day>=3)actions.push(button("查看售价与商品","details",false,"full",attrs({item:c.item})));
  actions.push(button("告诉来客：这次先不卖","pass",false,"quiet full",attrs({id:c.id})));
  return `<span class="tag">${state.phase==="prep"?"开门前":"营业中"} · 第${state.day}天</span><h2>柜台来客</h2><section class="counter-request" aria-label="当前来客需求"><p class="request-speaker">${esc(c.name)}来买东西</p><p class="request-words">“${esc(c.words)}”</p><dl class="counter-facts"><div><dt>想买</dt><dd>${c.count}${p.unit}${p.name}</dd></div><div><dt>货架上有</dt><dd>${stock}${p.unit}</dd></div><div><dt>现在单价</dt><dd>${price}钱<span> / ${p.unit}</span></dd></div><div><dt>来客每${p.unit}预算</dt><dd>${c.budget}钱</dd></div></dl>${state.phase==="open"&&asked&&n?`<div class="counter-quantity"><span>这次交货</span><div class="stepper">${button("−","saleqty",n<=1,"small",attrs({delta:-1})+' aria-label="减少交货数量"')}<output aria-live="polite">${n}${p.unit}</output>${button("＋","saleqty",n>=Math.min(stock,c.count),"small",attrs({delta:1})+' aria-label="增加交货数量"')}</div></div>`:""}<div class="counter-total"><span>${n?`交${n}${p.unit}${p.name} · 按当前售价合计`:"没有可交的库存"}</span><strong>${n?n*price:"—"}<small>${n?" 钱":""}</small></strong></div></section><div id="counter-status" class="counter-status${!stock||over?" warn":""}" role="status">${notes.map(note=>`<p>${esc(note)}</p>`).join("")||"核对数量和金额，再决定是否成交。"}</div><div class="task-actions">${actions.join("")}${canTrade&&!tutorial?'<p class="hint">点交货即成交，不再重复弹窗。</p>':""}</div>`;
}
function counterReceiptHTML(){
  const r=state.receipt,p=E.PRODUCTS[r.item];
  const reply=r.skipped?"那这次先不买了。":"货收好了，谢谢掌柜。";
  return `<span class="tag">交易小票</span><h2>${r.skipped?"这次没有成交":`这笔收到${r.income}钱`}</h2><div class="counter-receipt"><p class="receipt-reply">“${reply}”</p>${r.skipped?"<p>钱和货都没有改变。</p>":`<p>${esc(r.customer)}收下${r.quantity}${p.unit}${p.name}。</p><dl class="receipt-facts"><div><dt>收到货款</dt><dd>${r.income}钱</dd></div><div><dt>这批货的成本</dt><dd>${r.cost}钱</dd></div><div class="receipt-margin"><dt>这笔差价</dt><dd>${r.profit}钱</dd></div></dl><p class="hint">差价还没有扣今天的营业费。</p><details><summary>看这笔账怎么算</summary><p>${r.income}钱货款 − ${r.cost}钱成本 = ${r.profit}钱差价。</p><p>钱袋：${state.cash-r.income} → ${state.cash}钱。货款不是全部新赚的钱。</p></details>`}</div><div class="task-actions">${button(E.current(state)?"看看下一位来客的需求":"看看今天剩下什么","continue",false,"primary full")}${button("查看我的钱","money",false,"quiet full")}</div>`;
}
function counterSummaryCardHTML(){
  const r=state.report;if(!r)return "";
  const done=state.phase==="finished";
  const waste=r.rows.filter(x=>x.kind==="waste").map(x=>x.note).join(" ");
  const stockParts=Object.values(E.PRODUCTS).map(p=>[p,E.qty(state,p.id)]).filter(([,n])=>n>0).map(([p,n])=>`${p.name}${n}${p.unit}`).join("、");
  const extra=[];
  if(E.principal(state))extra.push(`定期本金${E.principal(state)}钱`);
  if(E.projectCost(state))extra.push("合作扇2把待到货");
  if(state.shelf)extra.push("已添置货架");
  let keyNote="";
  if(done){
    const tight=state.reports.reduce((m,x)=>!m||x.cash<m.cash?x:m,null);
    keyNote=tight&&tight.cash<=15?`第${tight.day}天收摊时手头只剩${tight.cash}钱，钱压在货或定期里最紧。`:stockParts?`最后货架还留着${stockParts}（进价共${E.inventoryCost(state)}钱），货不是现钱，需要卖出去才回款。`:`全部余货都已结清，手头留住${state.cash}钱现钱。`;
  }else{
    keyNote=waste?"今天有没卖完的饼食按规则清理了，明天可以按把握备货。":"明天的进货和本钱，继续由你自己安排。";
  }
  return `<span class="tag">${done?"五天收官 · 店铺仍在":"第"+state.day+"天收摊"}</span><h2>${done?"这五天的账，结清楚了":"今天收摊，盘一盘店里"}</h2><div class="counter-receipt"><dl class="receipt-facts"><div><dt>现在手头现钱</dt><dd>${state.cash}钱</dd></div><div><dt>${done?"货架余货":"今天收到货款"}</dt><dd>${done?(stockParts||"无余货"):(r.sales+"钱")}</dd></div><div class="receipt-margin"><dt>${done?"本轮开店本金":"今天营业费"}</dt><dd>${done?"50钱":(r.opened?"2钱":"未开业 0钱")}</dd></div></dl>${!done?`<p class="hint">货架还有：${stockParts||"空"}（进价${E.inventoryCost(state)}钱）${extra.length?" · "+extra.join(" · "):""}。</p>`:""}${done&&extra.length?`<p class="hint">店里另有：${extra.join(" · ")}。</p>`:""}<p style="margin:8px 0 0;font-size:13.5px;line-height:1.6">${esc(keyNote)}</p><details><summary>看完整账目说明</summary><p>今日现钱：${r.cashStart} → ${r.cash}钱。进货、存取本金和合作都会改变现钱，余额变化不等于纯利润。</p><p>计入现钱、库存进价${extra.length?"及店里安排":""}，今日账面变化 ${r.change>=0?"+"+r.change:r.change}钱。${esc(waste)}</p></details></div><div class="task-actions">${done?button("翻看这五天的账本","money",false,"primary full")+button("用相同客流再试一轮","restart",false,"full")+button("换一组客流重开","alternate",false,"quiet full"):button("进入第"+(state.day+1)+"天","next",false,"primary full")+button("查看我的钱与安排","money",false,"full")}</div>`;
}
function renderScene(c,gated,action){
  const previous=sceneQuantities;sceneQuantities={};
  $("shelves").innerHTML=Object.values(E.PRODUCTS).map(p=>{const n=E.qty(state,p.id),locked=p.id==="fan"&&state.day<3;sceneQuantities[p.id]=n;const cols=n>6?6:n>3?4:3,rows=Math.max(1,Math.ceil(n/cols)),w=p.id==="fan"?(rows>1?14:22):(rows>1?19:25);const images=Array.from({length:n},(_,i)=>{const col=i%cols,row=Math.floor(i/cols),left=4+col*(cols===6?14:cols===4?20:28),bottom=8+((rows-1-row)*31)+col*(p.id==="bread"?1:2);return `<img class="stock-art ${previous&&i>=previous[p.id]?"gain":""}" src="${ART[p.id]}" alt="" aria-hidden="true" style="left:${left}%;bottom:${bottom}%;width:${w}%">`;}).join("");return `<button class="shelf ${selected===p.id?"chosen":""} ${!n?"empty":""} ${locked?"locked":""}" data-action="select" data-item="${p.id}" data-stock="${n}" ${gated||locked?"disabled":""} aria-label="${p.name}，库存${n}${p.unit}，售价${state.prices[p.id]}铜钱" aria-pressed="${selected===p.id}"><span class="shelf-cost">${locked?"第3天介绍":"售 "+state.prices[p.id]}</span><span class="goods">${images}</span><span class="shelf-label">${p.name} ${locked?"· 待介绍":`×${n}`}</span></button>`;}).join("");
  $("scene-caption").textContent=`货架 ${E.allQty(state)} / ${E.capacity(state)} · ${state.shelf?"已添置货架 · ":""}货物随库存变化`;
  const phases={welcome:"自己的小铺，从一笔生意开始",prep:"备货，留好本钱",open:"看需求，自己决定怎么卖",receipt:"这一笔，钱和货都记清楚",summary:"收好今天的账",finished:"五天结清，家业还在"};
  $("step-title").textContent=resume?"欢迎回来，原进度还在。":phases[state.phase];
  $("step-note").textContent=state.phase==="receipt"?"收钱不等于全是利润，详细账目随时可以看。":state.phase==="summary"?"要不要进入下一天，由你决定。":"随时可以暂停，离开不扣钱、不坏货。";
  if(action&&action.type==="trade"&&state.receipt&&!state.receipt.skipped){const img=document.createElement("img");img.src=ART[state.receipt.item];img.className="flying-item "+state.receipt.item;img.alt="";$("motion-layer").replaceChildren(img);setTimeout(()=>img.remove(),750);}
}
