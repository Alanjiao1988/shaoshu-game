(function(root,factory){if(typeof module==="object"&&module.exports)module.exports=factory();else root.SeasonEngine=factory();})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const VERSION=7,DAYS=5,MAX_DAYS=200,UPKEEP=2;
const PRODUCTS={
  bread:{id:"bread",name:"饼食",unit:"份",cost:2,price:3,high:4,description:"普通饼食，当天收摊未售部分清理；不在离线时变坏。"},
  rope:{id:"rope",name:"麻绳",unit:"段",cost:3,price:5,high:6,description:"可跨日保存。军营扎砦与货商捆箱常用，剩货占用本钱。"},
  fan:{id:"fan",name:"蒲扇",unit:"把",cost:5,price:8,high:9,description:"第3天起可普通进货；暑热与江东船队需求旺，不保证全部卖出。"}
};
const DAY_INFO=[null,
  {title:"第一笔生意，亲手办成",subtitle:"先看客人需要什么，再看进价。",weather:"初晴",confirmed:"门口街坊要1段麻绳；后面一位旅人要2份饼食。",possible:"今天先熟悉交易，两位客人的需求已经确认。",reality:"收到的货款里有原来的成本，不能全部叫利润。"},
  {title:"今天的货，由我来选",subtitle:"备好两类货，再开门。",weather:"晴",confirmed:"两份饼食、一段麻绳已有熟客口头预订。",possible:"还可能有0—1位旅人买饼食。预订只是意向，正式成交才收钱。",reality:"买进的货还是资产，但不是现在能花的钱；多进不等于多赚。"},
  {title:"有限的本钱，安排下一步",subtitle:"利用昨天的剩货，再考虑新机会。",weather:"渐热",confirmed:"客人计划买2段麻绳、至少2份饼食。",possible:"另有2份饼食的客流线索；明天较热，可能有0—2位买扇的客人。具体到访事前未确认。",reality:"经营投入要问客户、成本、等待和退出；并非放进去就必增值。"},
  {title:"钱变成货，还要卖给客人",subtitle:"先看刚到的货，再决定今天补多少。",weather:"炎热",confirmed:"两份饼食有明确需求。",possible:"蒲扇可能卖0—2把，客流在开局固定，不因你的选择临时改变。较高报价也可能超过客人预算。",reality:"存款按约兑付，经营投资靠实际销售；两者的收益来源和风险不同。"},
  {title:"五日初成，大业方兴",subtitle:"结清开张五日账，第6日起可继续闯荡三国商路。",weather:"微风",confirmed:"两份饼食、一段麻绳有需求。",possible:"有公开清货买家，每把扇2、最多2把。第5天结清后可留着本钱继续进入第6天闯荡。",reality:"游戏铜钱不兑换学习军功。"}
];
const RELICS=[
  {id:"qixing",name:"七星刀残鞘",emoji:"🗡️",era:"第4回 · 孟德献刀",hero:"曹操",sell:26,clue:"匣身乌木嵌银星，隐约有洛阳相府火漆印。",story:"曹操行刺董卓时随机应变所献宝刀之旧鞘。"},
  {id:"hulao",name:"虎牢铁戟穗",emoji:"🔱",era:"第5回 · 三英战吕布",hero:"吕布",sell:30,clue:"匣中红缨虽旧却沉重非凡，带着关外边铁寒气。",story:"虎牢关前诸侯鏖战遗落的赤金戟穗。"},
  {id:"yuxi",name:"洛阳传国封泥",emoji:"🧱",era:"第6回 · 焚宫迁都",hero:"孙坚",sell:28,clue:"方寸紫泥印痕端正，刻有汉室篆字残纹。",story:"洛阳旧宫井畔拾得的宫廷封泥印蜕。"},
  {id:"baima",name:"白马义从铜铃",emoji:"🔔",era:"第7回 · 界桥之战",hero:"公孙瓒",sell:24,clue:"摇之清越如塞外胡骑，铃舌系着白马尾鬃。",story:"幽州白马义从战骑颈下所系响铃。"},
  {id:"qinggang",name:"长坂青釭剑璏",emoji:"⚔️",era:"第41回 · 单骑救主",hero:"赵云",sell:32,clue:"匣内玉具温润无瑕，剑璏刻着泥金『青釭』二字。",story:"当阳长坂坡七进七出时遗落的宝剑玉饰。"},
  {id:"yushan",name:"卧龙鹤羽残扇",emoji:"🪶",era:"第38回 · 隆中决策",hero:"诸葛亮",sell:30,clue:"匣轻如无物，开缝透出南阳松竹清香。",story:"隆中草庐故人留下的白鹤羽扇旧骨。"},
  {id:"guandu",name:"官渡乌巢火折",emoji:"🔥",era:"第30回 · 官渡奇袭",hero:"郭嘉",sell:26,clue:"铜管密封防潮，管壁刻有北军粮营字号。",story:"官渡大战夜袭乌巢时随军携带的引火铜筒。"},
  {id:"chibi",name:"赤壁折戟沉铁",emoji:"⚓",era:"第49回 · 七星坛借风",hero:"周瑜",sell:28,clue:"铁质犹带江沙水锈，洗净可见江东水军铭记。",story:"赤壁江滩冲上岸的古战船铁戟残片。"},
  {id:"tanxi",name:"檀溪跃马铜镫",emoji:"🐎",era:"第34回 · 马跃檀溪",hero:"刘备",sell:26,clue:"黄铜马镫磨损平滑，镫环沾有荆襄溪泥。",story:"襄阳城西檀溪急流中拾得的良驹铜镫。"},
  {id:"tongque",name:"邺城铜雀瓦砚",emoji:"🖋️",era:"第44回 · 铜雀台成",hero:"荀彧",sell:28,clue:"澄泥细润如玉，轻叩有金石之声。",story:"漳水之畔铜雀台工匠督造的澄泥古砚。"},
  {id:"hefei",name:"逍遥津虎威令",emoji:"🐯",era:"第67回 · 威震逍遥津",hero:"张辽",sell:30,clue:"玄铁令牌棱角凛冽，刻有合肥守军字样。",story:"合肥城下八百破十万一役的先锋木牌铜饰。"},
  {id:"shujin",name:"西川寸金蜀锦",emoji:"🧶",era:"第65回 · 智取益州",hero:"糜竺",sell:34,clue:"木匣夹层以油纸重重包裹，丝缕在暗处泛彩霞光。",story:"成都锦官城织造的上等云纹蜀锦，商路千金难求。"}
];
const RELIC_MAP=Object.fromEntries(RELICS.map(r=>[r.id,r]));
const SHOP_TIERS=[
  {level:0,name:"草市小摊",minRank:0,rankName:"布衣",cost:0,capBonus:0,desc:"临街起家，12格货架"},
  {level:1,name:"街坊百货铺",minRank:1,rankName:"什长",cost:18,capBonus:6,desc:"扩充6格货位，每日常客更稳"},
  {level:2,name:"临河大商栈",minRank:3,rankName:"军侯",cost:32,capBonus:10,desc:"共增10格货位，关隘大单多收1钱/件"},
  {level:3,name:"九州通商号",minRank:5,rankName:"中郎将",cost:50,capBonus:14,desc:"共增14格货位，早市淘货立减1钱"}
];
const ADVISORS=["诸葛亮","郭嘉","荀彧","贾诩","司马懿","周瑜","陆逊","徐庶","陈宫","荀攸","程昱"];
const MERCHANTS=["糜竺","鲁肃","顾雍","简雍","张昭"];
const WARRIORS=["关羽","张飞","赵云","张辽","吕布","马超","太史慈","甘宁","典韦","许褚","夏侯渊"];
const BOSS_FRONT=[
  {place:"官渡大营",item:"rope",count:2,pay:7,words:"官渡前线连夜加固营砦，急调结实麻绳，出价从优！"},
  {place:"汜水关前",item:"bread",count:3,pay:5,words:"汜水关下兵马急行，军需官高价搜购干粮饼食！"},
  {place:"白马坡营",item:"rope",count:2,pay:7,words:"白马坡车骑整备鞍具，急采两段好麻绳！"},
  {place:"延津渡口",item:"bread",count:3,pay:5,words:"延津渡船工与戍卒换防，急买三份饼食充饥！"},
  {place:"瓦口关隘",item:"rope",count:2,pay:7,words:"蜀道栈桥修补绳索，瓦口关军需出高价收麻绳！"},
  {place:"定军山营",item:"fan",count:2,pay:11,words:"山南暑气蒸腾，定军山随军医官急寻蒲扇祛暑！"},
  {place:"虎牢雄关",item:"rope",count:3,pay:7,words:"虎牢关下诸侯立寨，急收三段麻绳捆扎鹿角！"}
];
const RUMORS=[
  {minCh:0,maxCh:15,item:"rope",weather:"风紧",trueTitle:"十八路诸侯会盟关东，各营扎寨急需麻绳！",falseTitle:"街口闲汉传言关东罢兵，绳索怕要烂在手里。",realNote:"营寨连绵数十里，军需采买果然到处高价收麻绳。"},
  {minCh:0,maxCh:24,item:"bread",weather:"晴朗",trueTitle:"洛阳至徐州官道商旅络绎，干粮饼食半日即空！",falseTitle:"听说邻街新开三家食肆，今天饼食怕无人问津。",realNote:"赶路客商一拨接一拨，热腾腾的饼食刚上架就被抢购。"},
  {minCh:16,maxCh:36,item:"rope",weather:"秋燥",trueTitle:"官渡两军相持不下，北地粮车捆索千金难求！",falseTitle:"传闻河北商队倾销草绳，市价马上大跌。",realNote:"前线粮道昼夜转运，麻绳刚摆出来就有军需官高价全收。"},
  {minCh:25,maxCh:44,item:"bread",weather:"微风",trueTitle:"新野至樊城百姓携眷南行，沿途干粮极紧俏！",falseTitle:"渡口茶博士说今日封渡，怕是没几个过路客。",realNote:"渡船照常开行，赶路人家纷纷进店买饼食备在路上。"},
  {minCh:35,maxCh:60,item:"fan",weather:"闷热",trueTitle:"大江之上东南风起、暑气蒸人，江东水军急寻竹扇蒲扇！",falseTitle:"江北货郎说一夜入秋，扇子再也卖不动了。",realNote:"江面闷热难当，船家与书生争相高价求购蒲扇！"},
  {minCh:50,maxCh:130,item:"fan",weather:"炎晴",trueTitle:"荆襄盛夏酷暑，往来蜀道客商十人九买扇！",falseTitle:"山中樵夫说午后有暴雨骤寒，扇子莫要多备。",realNote:"日头毒辣无雨，过往行商见扇即买，出价豪爽！"},
  {minCh:60,maxCh:130,item:"rope",weather:"晴燥",trueTitle:"汉中栈道修缮木牛索具，良质麻绳一绳难求！",falseTitle:"传闻蜀道封闭数日，百货皆滞。",realNote:"栈道工匠清早便进城采办麻绳，出价远高于平日。"}
];

const clone=v=>JSON.parse(JSON.stringify(v));
function check(c,m){if(!c)throw new Error(m);}
function hashNum(seed,day,salt){
  let h=(Math.imul(seed^0x9e3779b9,2654435761)^Math.imul(day+salt*37,2246822519))>>>0;
  h=Math.imul(h^(h>>>15),2246822519)>>>0;
  return (h^(h>>>13))>>>0;
}
function cleanLord(l){
  if(!l||typeof l!=="object")return{chapter:1,rankLevel:0,rankName:"布衣",bossIndex:0,advisors:[],merchants:[],warriors:[],ownedCount:0};
  const pick=(arr,pool)=>Array.isArray(arr)?arr.filter(x=>typeof x==="string"&&pool.includes(x)).slice(0,5):[];
  const ch=Number.isInteger(l.chapter)?Math.max(1,Math.min(120,l.chapter)):1;
  const rk=Number.isInteger(l.rankLevel)?Math.max(0,Math.min(8,l.rankLevel)):0;
  const bi=Number.isInteger(l.bossIndex)?Math.max(0,Math.min(6,l.bossIndex)):0;
  const rn=typeof l.rankName==="string"&&l.rankName.slice(0,10)||"布衣";
  const oc=Number.isInteger(l.ownedCount)?Math.max(0,Math.min(160,l.ownedCount)):0;
  return{chapter:ch,rankLevel:rk,rankName:rn,bossIndex:bi,advisors:pick(l.advisors,ADVISORS),merchants:pick(l.merchants,MERCHANTS),warriors:pick(l.warriors,WARRIORS),ownedCount:oc};
}
function dayPlan(s){
  const l=cleanLord(s.lord),h=hashNum(s.seed,s.day,11);
  const eligible=RUMORS.filter(r=>l.chapter>=r.minCh&&l.chapter<=r.maxCh);
  const pool=eligible.length?eligible:RUMORS;
  const r=pool[h%pool.length];
  const isTrue=(h>>>3)%3!==0; // 2/3 real opportunity, 1/3 smokescreen
  const advisor=l.advisors.length?l.advisors[(h>>>5)%l.advisors.length]:"";
  const merchant=l.merchants.length?l.merchants[(h>>>7)%l.merchants.length]:"";
  const warrior=l.warriors.length?l.warriors[(h>>>9)%l.warriors.length]:"";
  // Morning market bundle deal
  const bundleItems=s.day>=3?["bread","rope","fan"]:["bread","rope"];
  const bItem=bundleItems[(h>>>4)%bundleItems.length];
  const bp=PRODUCTS[bItem];
  const bQty=bItem==="fan"?3:4;
  const baseBundleCost=bQty*bp.cost - (bItem==="fan"?3:3);
  const tierDiscount=(s.shopLevel||0)>=3?1:0;
  const merchantDiscount=merchant?1:0;
  const bCost=Math.max(bQty,baseBundleCost-tierDiscount-merchantDiscount);
  // Mystery box
  const unowned=RELICS.filter(x=>!(s.relics||[]).includes(x.id));
  const relicPool=unowned.length?unowned:RELICS;
  const relic=relicPool[(h>>>6)%relicPool.length];
  const boxRoll=(h>>>8)%10; // 0..4 relic (50%), 5..7 good stock (30%), 8..9 damp scrap (20%)
  const boxKind=boxRoll<5?"relic":boxRoll<8?"goods":"scrap";
  const boxPrice=Math.max(8,12-(merchant?1:0)-((s.shopLevel||0)>=3?1:0));
  const boxClue=boxKind==="relic"?relic.clue:boxKind==="goods"?"木匣分量敦实、封口干燥，晃动似有成捆齐整百货。":"木匣入手偏轻，底角隐约透出一股江滩潮气。";
  const warriorHint=warrior?(boxKind==="relic"?`麾下${warrior}端详封泥：匣中似有军阵旧物灵光，值得出手！`:boxKind==="goods"?`麾下${warrior}掂了掂分量：虽非古物，但里面货色瓷实不亏。`:`麾下${warrior}皱眉提醒：匣底受潮虚轻，多半是寻常废料，慎买！`):"";
  const advisorHint=advisor?(isTrue?`麾下${advisor}传信：此风声与前线粮道吻合，可提前备下${PRODUCTS[r.item].name}！`:`麾下${advisor}微笑摇扇：此乃坊间虚言，莫要盲目重仓${PRODUCTS[r.item].name}，按常备货即可。`):"";
  const front=BOSS_FRONT[(l.bossIndex+s.day)%BOSS_FRONT.length];
  return{
    rumor:{
      chapter:l.chapter,item:r.item,isTrue,weather:r.weather,
      text:isTrue?r.trueTitle:r.falseTitle,
      outcome:isTrue?r.realNote:"坊间传言果然落空，幸好稳住阵脚看清实需。",
      advisor,advisorHint
    },
    market:{
      bundle:{item:bItem,qty:bQty,cost:bCost,normalCost:bQty*bp.cost,merchant},
      box:{price:boxPrice,kind:boxKind,relicId:relic.id,clue:boxClue,warrior,warriorHint}
    },
    front
  };
}
function info(s){
  if(s.day<=5)return DAY_INFO[s.day];
  const plan=dayPlan(s),season=["初春","仲夏","金秋","隆冬"][Math.floor(((s.day-1)%20)/5)];
  return{
    title:`${season} · 第${s.day}日商路`,
    subtitle:"观三国风声，早市淘奇货，稳掌自家商号。",
    weather:plan.rumor.weather,
    confirmed:plan.rumor.text,
    possible:`前线关隘风向：${plan.front.place}正在寻购军需物资。`,
    reality:"铜钱用于扩建商号与淘换三国名物，与学习军功各自独立。"
  };
}
function capacity(s){
  const base=12+(s.shelf?6:0);
  const tierBonus=SHOP_TIERS[s.shopLevel||0]?.capBonus||0;
  return base+tierBonus;
}
function qty(s,id){return s.inventory[id].reduce((n,l)=>n+l.qty,0);}
function allQty(s){return Object.keys(PRODUCTS).reduce((n,id)=>n+qty(s,id),0);}
function inventoryCost(s){return Object.values(s.inventory).flat().reduce((n,l)=>n+l.qty*l.cost,0);}
function principal(s){return s.deposits.reduce((n,d)=>n+(d.status==="active"?d.amount:0),0);}
function projectCost(s){return s.project&&s.project.status==="producing"?8:0;}
function shopInvested(s){
  let sum=s.shelf?12:0;
  for(let i=1;i<=(s.shopLevel||0);i++)sum+=SHOP_TIERS[i].cost;
  return sum;
}
function netWorth(s){return s.cash+inventoryCost(s)+principal(s)+projectCost(s)+shopInvested(s);}
function log(s,title,cash=0,goods={},note="",kind="activity"){s.log.push({day:s.day,title,cash,goods,note,kind});if(s.log.length>240)s.log=s.log.slice(-240);}
function add(s,id,n,cost,source="wholesale"){s.inventory[id].push({qty:n,cost,source});}
function take(s,id,n){check(qty(s,id)>=n,"货架没有足够的货。可以少交一点，或告诉客人暂时缺货。");let remain=n,cost=0,projectQty=0;while(remain){const lot=s.inventory[id][0],used=Math.min(lot.qty,remain);cost+=used*lot.cost;if(lot.source==="project")projectQty+=used;lot.qty-=used;remain-=used;if(!lot.qty)s.inventory[id].shift();}return{cost,projectQty};}
function canPay(s,n){return Number.isSafeInteger(n)&&n>=0&&s.cash-n>=((s.phase==="summary"||s.phase==="finished")?0:UPKEEP);}
function pay(s,n,title,note){check(canPay(s,n),"这笔安排会让现钱不足。开业要留2铜钱费用；可减少数量、取回定期本金，或先不做。");s.cash-=n;log(s,title,-n,{},note,"transfer");}
function customers(s){
  const c=(id,name,item,count,budget,words,appearance="worker",vip=false)=>({id:`d${s.day}-${id}`,name,item,count,budget,words,appearance,vip});
  if(s.day<=5){
    switch(s.day){
      case 1:return[c("rope","搬货街坊","rope",1,5,"箱子还没捆好，我想买1段麻绳，5铜钱可以吗？"),c("bread","赶路旅人","bread",2,3,"两个人赶路，想带2份饼食，一共6铜钱。","traveler")];
      case 2:{const list=[c("bread","熟客阿禾","bread",2,3,"昨天问好的2份饼食，还买得到吗？","woman"),c("rope","邻街货郎","rope",1,5,"带一段绳，捆一下货。")];if(Math.abs(s.seed)%2===1)list.push(c("extra","过路旅人","bread",1,3,"有一份饼食吗？赶路时吃。","traveler"));return list;}
      case 3:return[c("rope","搬货街坊","rope",2,5,"今天有两箱货，想买2段麻绳。"),c("bread","街坊阿禾","bread",2,3,"先前说好的两份饼食，劳烦了。","woman"),c("extra","两位旅人","bread",2,3,"闻到饼香，我们也想带2份。","traveler")];
      case 4:{const list=[c("bread","熟客阿禾","bread",2,3,"今天还是2份饼食。","woman")];for(let i=0;i<Math.abs(s.seed)%3;i++)list.push(c("fan"+i,i?"赶路旅人":"乘凉街坊","fan",1,i?9:8,i?"路上热，想买一把扇子，9以内可以。":"天热了，8铜钱买一把扇子可以吗？",i?"traveler":"worker"));return list;}
      case 5:return[c("bread","两位旅人","bread",2,3,"两份饼食，准备继续赶路。","traveler"),c("rope","邻街货郎","rope",1,5,"再带一段麻绳。")];
    }
  }
  const plan=dayPlan(s),h=hashNum(s.seed,s.day,29),bonus=(s.shopLevel||0)>=2?1:0;
  const list=[];
  // 1. Regular town demand
  list.push(c("town","街坊常客","bread",2+(s.shopLevel>=1?1:0),3,"铺子越开越稳当，今天带几份新鲜饼食回家。","woman"));
  // 2. Rumor-driven demand
  if(plan.rumor.isTrue){
    const ri=plan.rumor.item,rp=PRODUCTS[ri];
    const surgePay=rp.high+1+bonus;
    const surgeCnt=ri==="fan"?2:3;
    list.push(c("surge","顺风采买商",ri,surgeCnt,surgePay,`外头都在抢购${rp.name}，你店里若有现货，我按每${rp.unit}${surgePay}钱高价全收！`,"traveler",true));
  }else{
    const alt=plan.rumor.item==="rope"?"bread":"rope",ap=PRODUCTS[alt];
    list.push(c("calm","过路行商",alt,2,ap.price,`坊间传言不实，我只按常价买2${ap.unit}${ap.name}赶路。`,"traveler"));
  }
  // 3. Frontline boss demand or incognito hero visit
  if(h%2===0){
    const f=plan.front;
    list.push(c("front",`${f.place}采买官`,f.item,f.count,f.pay+bonus,f.words,"worker",true));
  }else{
    const l=cleanLord(s.lord);
    const guest=l.chapter>=38?{name:"羽扇青衫客",item:"fan",cnt:2,pay:10+bonus,words:"山野散人路过避暑，掌柜若有好蒲扇，愿出高价求购两把。"}:l.chapter>=25?{name:"红脸长髯壮士",item:"rope",cnt:2,pay:7+bonus,words:"某随兄长千里远行，特来买两段结实麻绳拴马捆囊。"}:{name:"织席温厚客",item:"rope",cnt:2,pay:6+bonus,words:"小可素日编席贩履，见掌柜麻绳厚实，想买两段备用。"};
    list.push(c("hero",guest.name,guest.item,guest.cnt,guest.pay,guest.words,"traveler",true));
  }
  return list;
}
function current(s){return customers(s)[s.cursor]||null;}
function initial(seed=1){
  return{
    version:VERSION,seed:Number.isSafeInteger(seed)?seed:1,day:1,phase:"welcome",cash:50,
    inventory:{bread:[],rope:[],fan:[]},prices:{bread:3,rope:5,fan:8},cursor:0,opened:false,asked:[],receipt:null,
    deposits:[],depositSequence:0,savedToday:false,project:null,shelf:false,worked:false,cleared:0,
    report:null,reports:[],startCash:50,startWorth:50,notes:[],
    lord:cleanLord(null),shopLevel:0,bundleBought:false,boxBought:false,pendingRelic:null,relics:[],
    log:[{day:1,title:"开店本金",cash:50,goods:{},note:"这是自己原有的50，不是营业收入。",kind:"opening"}]
  };
}
function validate(s){
  check(s.version===VERSION&&Number.isSafeInteger(s.seed),"游戏版本或局面无效。");
  check(Number.isInteger(s.day)&&s.day>=1&&s.day<=MAX_DAYS,"营业日无效。");
  check(["welcome","prep","open","receipt","summary","finished"].includes(s.phase),"营业阶段无效。");
  check(Number.isInteger(s.cash)&&s.cash>=0,"钱袋状态无效。");
  for(const id of Object.keys(PRODUCTS)){
    check(Array.isArray(s.inventory[id]),"库存无效。");
    for(const l of s.inventory[id])check(Number.isInteger(l.qty)&&l.qty>0&&Number.isInteger(l.cost)&&l.cost>0&&["wholesale","project","market"].includes(l.source),"库存批次无效。");
    check([PRODUCTS[id].price,PRODUCTS[id].high].includes(s.prices[id]),"售价无效。");
  }
  check(allQty(s)<=capacity(s),"货架容量不足。");
  check(s.cursor>=0&&s.cursor<=customers(s).length,"顾客进度无效。");
  check(s.deposits.filter(d=>d.status==="active").length<=1,"只能有一笔未到期定期。");
  s.deposits.forEach(d=>check([20,40].includes(d.amount)&&[1,2].includes(d.term)&&d.interest===d.amount/20&&d.due===d.opened+d.term+1&&["active","withdrawn","matured"].includes(d.status),"存款条款无效。"));
  if(s.project)check(s.project.due===4&&["producing","delivered"].includes(s.project.status),"合作项目状态无效。");
  check(Number.isInteger(s.shopLevel||0)&&(s.shopLevel||0)>=0&&(s.shopLevel||0)<=3,"商号等级无效。");
  check(Array.isArray(s.relics||[])&&(s.relics||[]).every(id=>Boolean(RELIC_MAP[id])),"藏珍记录无效。");
  if(s.pendingRelic)check(Boolean(RELIC_MAP[s.pendingRelic]),"待鉴定奇物无效。");
  return true;
}
function advanceDay(s){
  s.startCash=s.cash;s.startWorth=netWorth(s);s.day++;s.phase="prep";
  s.cursor=0;s.opened=false;s.asked=[];s.receipt=null;s.report=null;
  s.worked=false;s.savedToday=false;s.cleared=0;s.notes=[];
  s.bundleBought=false;s.boxBought=false;s.pendingRelic=null;
  for(const d of s.deposits.filter(x=>x.status==="active"&&x.due===s.day)){
    d.status="matured";s.cash+=d.amount;log(s,"定期本金到期取回",d.amount,{},"本金换回现钱，不重复记为利润。","principal");
    s.cash+=d.interest;log(s,"约定模拟利息到账",d.interest,{},"只有这部分是新增收益。","interest");
    s.notes.push(`到期本金${d.amount}和模拟利息${d.interest}回到钱袋。`);
  }
  if(s.project&&s.project.status==="producing"&&s.project.due===s.day){
    check(allQty(s)+2<=capacity(s),"合作到货所需的两个位置必须保留。");
    s.project.status="delivered";add(s,"fan",2,4,"project");
    log(s,"合作蒲扇到货",0,{fan:2},"此前投入8变成两把扇，每把成本4；到货还不是收入。","arrival");
    s.notes.push("合作到货2把蒲扇。钱变成货，还需要卖给客人。");
  }
}
function step(input,a){
  const s=clone(input);
  if(!s.lord)s.lord=cleanLord(null);
  if(s.shopLevel===undefined)s.shopLevel=0;
  if(!Array.isArray(s.relics))s.relics=[];
  if(s.bundleBought===undefined)s.bundleBought=false;
  if(s.boxBought===undefined)s.boxBought=false;
  if(s.pendingRelic===undefined)s.pendingRelic=null;
  check(a&&typeof a.type==="string","未知操作。");
  if(a.type==="synclord"){
    s.lord=cleanLord(a);
    validate(s);return s;
  }
  if(a.type==="inherit_relics"){
    check(Array.isArray(a.ids)&&a.ids.every(id=>Boolean(RELIC_MAP[id])),"传承奇物无效。");
    for(const id of a.ids)if(!s.relics.includes(id))s.relics.push(id);
    validate(s);return s;
  }
  if(a.type==="continue_beyond"){
    check(s.phase==="finished"&&s.day<MAX_DAYS,"当前不在五日收官后续营节点。");
    advanceDay(s);
    log(s,`开启第${s.day}日新商路`,0,{},"带着原有本钱、货架与藏珍继续经营。","decision");
    validate(s);return s;
  }
  check(s.phase!=="finished","本阶段已收官，可点『带着家底继续闯荡』进入下一天，或翻看账本。");
  if(a.type==="begin"){check(s.phase==="welcome","已经接手这间店。");s.phase="prep";validate(s);return s;}
  if(a.type==="next"){
    check(s.phase==="summary"&&s.day<MAX_DAYS&&(s.day!==5),"先完成本日结账，再进入下一天。");
    advanceDay(s);validate(s);return s;
  }
  check(s.phase!=="welcome","先接手自己的杂货店。");
  switch(a.type){
    case "ask":{
      check(["prep","open"].includes(s.phase),"先看小票或结束账单。");
      const c=current(s);check(c&&a.id===c.id,"这位客人已经离开，请看当前客人。");
      check(!s.asked.includes(c.id),"这条需求已经问清了。");
      s.asked.push(c.id);log(s,"问清客人需求",0,{},c.words,"question");break;
    }
    case "buy":{
      const p=Object.hasOwn(PRODUCTS,a.item)?PRODUCTS[a.item]:null;check(p,"没有这种商品。");
      check(Number.isInteger(a.quantity)&&a.quantity>=1&&a.quantity<=6,"每次可进1—6件。");
      check(s.phase==="prep"||(s.day===1&&s.phase==="open"),"营业已经开始，今天不再随时补货；先安排好明天的采购。");
      check(s.day>=3||a.item!=="fan","先认识两类货，第3天再开放蒲扇。");
      if(s.day===1){
        const c=current(s);check(c&&s.asked.includes(c.id),"先问清眼前客人需要什么，再看这笔进货。");
        check(c.item===a.item&&qty(s,a.item)+a.quantity<=c.count,"首日先按眼前需求进货，熟悉后再自主备货。");
      }
      const reserved=s.project&&s.project.status==="producing"?2:0;
      check(allQty(s)+a.quantity+reserved<=capacity(s),"货架位置不够，要为已约定的到货留位置。");
      pay(s,a.quantity*p.cost,`进货：${p.name}${a.quantity}${p.unit}`,"钱变为库存，每件进价"+p.cost);
      add(s,a.item,a.quantity,p.cost);
      log(s,"货物上架",0,{[a.item]:a.quantity},"真实数量与采购成本一起记录。","arrival");break;
    }
    case "bundle":{
      check(s.day>=2&&s.phase==="prep"&&!s.bundleBought,"早市整捆抄底只在每天开门前提供一次。");
      const b=dayPlan(s).market.bundle,p=PRODUCTS[b.item];
      const reserved=s.project&&s.project.status==="producing"?2:0;
      check(allQty(s)+b.qty+reserved<=capacity(s),`货架空位不足${b.qty}格，装不下这一整捆。`);
      pay(s,b.cost,`早市抄底：${p.name}${b.qty}${p.unit}`,`整捆特惠共${b.cost}钱（省${b.normalCost-b.cost}钱）`);
      const unitCost=Math.max(1,Math.floor(b.cost/b.qty)),rem=b.cost-unitCost*b.qty;
      if(b.qty-rem>0)add(s,b.item,b.qty-rem,unitCost,"market");
      if(rem>0)add(s,b.item,rem,unitCost+1,"market");
      s.bundleBought=true;
      s.notes.push(`早市花${b.cost}钱整捆抄底了${b.qty}${p.unit}${p.name}。`);
      break;
    }
    case "mystery":{
      check(s.day>=2&&s.phase==="prep"&&!s.boxBought&&!s.pendingRelic,"早市封泥木匣每天只能淘一次。");
      const box=dayPlan(s).market.box;
      if(box.kind==="goods"){
        const reserved=s.project&&s.project.status==="producing"?2:0;
        check(allQty(s)+3+reserved<=capacity(s),"请至少留出3格货架空位，以防匣中开出成捆百货。");
      }
      pay(s,box.price,"早市淘封泥木匣",box.clue);
      s.boxBought=true;
      if(box.kind==="relic"){
        s.pendingRelic=box.relicId;
        const r=RELIC_MAP[box.relicId];
        log(s,`木匣开出奇物：${r.name}`,0,{},r.story,"arrival");
      }else if(box.kind==="goods"){
        const item=s.day>=3?"fan":"rope",p=PRODUCTS[item],n=item==="fan"?2:3;
        add(s,item,n,Math.max(1,Math.floor(box.price/n)),"market");
        const msg=`木匣里是保存完好的${n}${p.unit}${p.name}（市值约${n*p.price}钱），已上架！`;
        log(s,"木匣开出紧俏好货",0,{[item]:n},msg,"arrival");
        s.notes.push(msg);
      }else{
        const salvage=4;s.cash+=salvage;
        const msg=`木匣里只是受潮旧竹简，拆卖废料收回${salvage}钱。眼力交了一回学费。`;
        log(s,"木匣走眼回收废料",salvage,{},msg,"sale");
        s.notes.push(msg);
      }
      break;
    }
    case "relic_choice":{
      check(Boolean(s.pendingRelic),"当前没有待处置的木匣奇物。");
      check(["keep","sell"].includes(a.choice),"请选择珍藏或出售。");
      const r=RELIC_MAP[s.pendingRelic];
      s.pendingRelic=null;
      if(a.choice==="keep"&&!s.relics.includes(r.id)){
        s.relics.push(r.id);
        log(s,`收入藏珍阁：${r.name}`,0,{},`${r.era} · 镇店收藏，主公藏珍阁同步点亮！`,"decision");
        s.notes.push(`已将「${r.name}」收入主公藏珍阁永久镇店！`);
      }else{
        s.cash+=r.sell;
        log(s,`割爱让出奇物：${r.name}`,r.sell,{},`西域富商当场奉上${r.sell}铜钱收走奇物。`,"sale");
        s.notes.push(`将「${r.name}」以${r.sell}钱高价让予富商，本钱大增！`);
      }
      break;
    }
    case "upgrade_shop":{
      check(["prep","summary"].includes(s.phase),"请在开门前或收摊后扩建商号。");
      check(!s.pendingRelic,"请先处置刚开出的木匣奇物。");
      const nextLv=(s.shopLevel||0)+1;
      const tier=SHOP_TIERS[nextLv];
      check(tier,"商号已升至最高规格『九州通商号』。");
      const l=cleanLord(s.lord);
      check(l.rankLevel>=tier.minRank,`主公官职需先达到『${tier.rankName}』（靠日常学习军功晋升），方可扩建为${tier.name}。`);
      pay(s,tier.cost,`扩建商号：${tier.name}`,tier.desc);
      s.shopLevel=nextLv;
      s.notes.push(`商号正式扩建为「${tier.name}」，货架总容量升至${capacity(s)}格！`);
      break;
    }
    case "price":{
      check(s.day>=3&&["prep","open"].includes(s.phase),"前两天先按清楚报价做生意；第3天起可改价。");
      const p=Object.hasOwn(PRODUCTS,a.item)?PRODUCTS[a.item]:null;
      check(p&&[p.price,p.high].includes(a.price),"这个商品只有两种可选售价。");
      s.prices[a.item]=a.price;log(s,"调整"+p.name+"售价",0,{},"新售价"+a.price+"，超过预算的客人可能不买。","decision");break;
    }
    case "open":{
      check(s.phase==="prep","已经开业，或今天已结账。");
      check(!s.pendingRelic,"请先决定木匣开出的奇物是珍藏还是出售，再开门迎客。");
      check(s.cash>=2,"开业要先留2铜钱营业费。可以取回本金、少进货，或做一次临时工作。");
      if(s.day===1){
        const c=current(s);check(c,"今天的客人都已处理，可以直接查看今天的账，不必再开业。");
        check(s.asked.includes(c.id)&&qty(s,c.item)>=1,"先问清眼前需求并准备货物，或明确告诉客人暂不接。");
      }
      s.phase="open";s.opened=true;
      if(s.day>=6)s.notes.push(dayPlan(s).rumor.outcome);
      log(s,"确认开业",0,{},"本次营业费用2，收摊只付一次；离线不计时收费。","decision");break;
    }
    case "trade":{
      check(s.phase==="open","先确认开业，再交货。");
      const c=current(s);check(c&&a.id===c.id,"这笔交易已经处理，请勿重复确认。");
      check(a.item===c.item,"客人需要的不是这种货。可以换回正确商品或不成交。");
      check(Number.isInteger(a.quantity)&&a.quantity>=1&&a.quantity<=c.count,"数量超出客人的需要。");
      const unitPay=c.vip?Math.max(s.prices[c.item],c.budget):s.prices[c.item];
      check(unitPay<=c.budget,"当前售价超过客人每件预算。可以降低售价或暂时不卖，不会强行成交。");
      const r=take(s,c.item,a.quantity),income=a.quantity*unitPay;
      s.cash+=income;
      if(s.project&&r.projectQty){s.project.sold+=r.projectQty;s.project.recovered+=r.projectQty*unitPay;}
      log(s,`交付${PRODUCTS[c.item].name}${a.quantity}${PRODUCTS[c.item].unit}`,income,{[c.item]:-a.quantity},`收入${income}，对应成本${r.cost}，本单毛利${income-r.cost}；营业费用另算。`,"sale");
      s.receipt={customer:c.name,item:c.item,quantity:a.quantity,income,cost:r.cost,profit:income-r.cost,unitPay,vip:Boolean(c.vip),skipped:false};
      s.cursor++;s.phase="receipt";break;
    }
    case "pass":{
      check(["prep","open"].includes(s.phase),"先处理小票。");
      const c=current(s);check(c&&a.id===c.id,"客人已换，请看眼前事项。");
      log(s,"这次暂不成交",0,{},"保留货与钱，不扣好感，不凭空给予补偿。","decision");
      s.receipt={customer:c.name,skipped:true,item:c.item,quantity:0,income:0,cost:0,profit:0};
      s.cursor++;if(s.phase==="open")s.phase="receipt";break;
    }
    case "continue":check(s.phase==="receipt","没有等待确认的小票。");s.receipt=null;s.phase="open";break;
    case "close":{
      check(["prep","open"].includes(s.phase),"先看完这笔交易，再结账。");
      check(!s.pendingRelic,"请先处置木匣奇物再收摊。");
      if(s.opened){check(s.cash>=2,"营业费用还差一点，可取回本金或完成一次临时工作。");s.cash-=2;log(s,"本日营业费用",-2,{},"确认开业后才收，未开业不收。","expense");}
      const bread=qty(s,"bread");
      if(bread){
        const r=take(s,"bread",bread);
        log(s,"当天饼食到期清理",0,{bread:-bread},`事先说明的游戏保鲜规则：清理${bread}份，损失采购成本${r.cost}；不随离线时间变坏。`,"waste");
        s.notes.push(`未售饼食${bread}份按原保鲜规则清理，成本${r.cost}没有收回。`);
      }
      const rows=s.log.filter(e=>e.day===s.day&&e.kind!=="opening");
      s.report={day:s.day,cashStart:s.startCash,cash:s.cash,inventoryCost:inventoryCost(s),inventory:{bread:qty(s,"bread"),rope:qty(s,"rope"),fan:qty(s,"fan")},principal:principal(s),projectCost:projectCost(s),worth:netWorth(s),change:netWorth(s)-s.startWorth,rows:clone(rows),notes:s.notes.slice(),sales:rows.filter(r=>r.kind==="sale"||r.kind==="clear").reduce((n,r)=>n+r.cash,0),opened:s.opened};
      s.reports.push(clone(s.report));
      if(s.reports.length>60)s.reports=s.reports.slice(-60);
      s.phase=s.day===5?"finished":"summary";break;
    }
    case "deposit":{
      check(s.phase==="summary"&&s.day>=2&&!s.savedToday,"第2天起收摊后才安排一次定期，先把本日经营账看清。");
      check(!s.deposits.some(d=>d.status==="active"),"先等已有定期到期，或提前取回本金。");
      check([20,40].includes(a.amount)&&[1,2].includes(a.term),"本金选20或40，经过1或2个营业日。");
      const due=s.day+a.term+1;
      check(s.day>5||due<=5,"到期超出五日初篇，可在第5天续营后再存。");
      check(due<=MAX_DAYS,"到期超出上限。");
      check(s.cash>=a.amount,"本金必须是现在的钱袋，不是库存估值。");
      s.cash-=a.amount;
      const d={id:++s.depositSequence,amount:a.amount,term:a.term,opened:s.day,due,interest:a.amount/20,status:"active"};
      s.deposits.push(d);s.savedToday=true;
      log(s,"存入现代定期模拟",-a.amount,{},`经过${a.term}个完整营业日，第${due}天开门返本金${a.amount}及模拟息${d.interest}；不自动续存。`,"principal");break;
    }
    case "withdraw":{
      check(s.phase!=="welcome","先进入经营。");
      const d=s.deposits.find(d=>d.id===a.id&&d.status==="active");
      check(d,"本金已取回或不存在，不能重复领取。");
      d.status="withdrawn";s.cash+=d.amount;
      log(s,"提前取回定期本金",d.amount,{},"本游戏提前利息0，未扣本金。","principal");break;
    }
    case "invest":{
      check(s.day===3&&["prep","summary"].includes(s.phase)&&!s.project,"这段只在第3天备货前或收摊后做一次供货合作，第4天到货。");
      check(allQty(s)+2<=capacity(s),"需要留出两个货架位置等合作到货。");
      pay(s,8,"与编扇人合作一小批货","普通现货每把5；合作总付8做2把，第4天到货。");
      s.project={cost:8,due:4,status:"producing",sold:0,recovered:0};break;
    }
    case "clear":{
      check(s.day>=5&&["prep","open"].includes(s.phase),"第5天起才有公开清货买家。");
      check(Number.isInteger(a.quantity)&&a.quantity>=1&&a.quantity+s.cleared<=2,"公开买家每日总共只收2把，不是无限回购。");
      const r=take(s,"fan",a.quantity);s.cleared+=a.quantity;const income=2*a.quantity;s.cash+=income;
      if(s.project&&r.projectQty){s.project.sold+=r.projectQty;s.project.recovered+=2*r.projectQty;}
      log(s,"按公开报价清货",income,{fan:-a.quantity},`每把2，共收${income}；对应成本${r.cost}。`,"clear");break;
    }
    case "shelf":
      check(s.day>=2&&["prep","summary"].includes(s.phase)&&!s.shelf,"第2天起可添一次基础木架。");
      pay(s,12,"添置基础木货架","增加6个位置，按投入12记账。");s.shelf=true;break;
    case "work":
      check(["prep","open"].includes(s.phase)&&s.cash<2&&!s.worked,"现钱不足开业费用时，本日可接唯一一次整理工作。");
      s.worked=true;s.cash+=4;log(s,"为邻铺整理一次货物",4,{},"实际付出时间取得4报酬。","work");break;
    default:throw new Error("暂不支持这项操作，不会假装执行自由建议。");
  }
  validate(s);return s;
}
return{VERSION,DAYS,MAX_DAYS,UPKEEP,PRODUCTS,DAY_INFO,RELICS,RELIC_MAP,SHOP_TIERS,ADVISORS,MERCHANTS,WARRIORS,initial,step,info,dayPlan,qty,allQty,inventoryCost,principal,projectCost,shopInvested,netWorth,capacity,canPay,current,customers,validate};
});
