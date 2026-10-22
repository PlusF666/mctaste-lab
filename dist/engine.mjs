export const AXES = [
  {id:'beef',label:'牛肉汉堡',short:'牛肉派',icon:'◎'},
  {id:'chicken',label:'鸡肉汉堡',short:'鸡肉派',icon:'✦'},
  {id:'fish',label:'鱼肉汉堡',short:'鱼堡派',icon:'≈'},
  {id:'snack',label:'小食',short:'小食派',icon:'▥'},
  {id:'dessert',label:'甜品',short:'甜蜜派',icon:'♡'},
  {id:'drink',label:'饮品',short:'畅饮派',icon:'◒'}
];
const axes = new Set(AXES.map(x=>x.id));
export const CHOICES = ['left','right','both','neither','skip'];

export function validateCatalog(c) {
  if(!c || c.version!==1 || !['public-demo','mcp'].includes(c.source))throw new Error('不支持的餐品集版本或来源');
  if(!Array.isArray(c.items)||c.items.length<2||c.items.length>500)throw new Error('餐品集需要 2—500 个餐品');
  if(!c.context || typeof c.context.store_name!=='string')throw new Error('缺少餐品集范围名称');
  if(c.source==='mcp' && (!c.context.store_id || !c.context.dining_mode || !c.captured_at))throw new Error('MCP 餐品集缺少门店、就餐方式或采集时间');
  if(typeof c.captured_at!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(c.captured_at)||!Number.isFinite(Date.parse(c.captured_at)))throw new Error('采集时间需要带时区的有效 ISO 时间');
  const ids=new Set();
  for(const x of c.items){
    if(typeof x.id!=='string'||!x.id||ids.has(x.id))throw new Error('餐品 ID 缺失或重复');ids.add(x.id);
    if(typeof x.name!=='string'||!x.name.trim()||!axes.has(x.feature))throw new Error('餐品名称或偏好分类无效');
    if(x.price_fen!==null && (!Number.isSafeInteger(x.price_fen)||x.price_fen<0))throw new Error('价格必须为整数分或 null');
    if(x.image!==undefined && (typeof x.image!=='string'||!(/^(?:assets\/[a-zA-Z0-9_.-]+|https:\/\/[^\s]+)$/.test(x.image))))throw new Error('图片只允许本地 assets 文件或 HTTPS 地址');
  }
  return c;
}

export function learn(catalog,history=[]) {
  validateCatalog(catalog);
  if(!Array.isArray(history)||history.length>100)throw new Error('实验记录无效');
  const byId=new Map(catalog.items.map(x=>[x.id,x]));
  const evidence=Object.fromEntries(AXES.map(a=>[a.id,{positive:0,negative:0,seen:0}]));
  const items=Object.fromEntries(catalog.items.map(x=>[x.id,{positive:0,negative:0,seen:0}]));
  let effective=0;
  for(const h of history){
    const l=byId.get(h.left),r=byId.get(h.right);
    if(!l||!r||l.id===r.id||!CHOICES.includes(h.choice))throw new Error('实验记录含无效餐品或选择');
    for(const x of [l,r])items[x.id].seen++;
    for(const f of new Set([l.feature,r.feature]))evidence[f].seen++;
    if(h.choice==='skip')continue;
    effective++;
    const yes=h.choice==='both'?[l,r]:h.choice==='left'?[l]:h.choice==='right'?[r]:[];
    const no=h.choice==='neither'?[l,r]:h.choice==='left'?[r]:h.choice==='right'?[l]:[];
    yes.forEach(x=>items[x.id].positive++);no.forEach(x=>items[x.id].negative++);
    // Within-category choices inform the item preference, not the category.
    if(l.feature===r.feature && ['left','right'].includes(h.choice))continue;
    for(const f of new Set(yes.map(x=>x.feature)))evidence[f].positive++;
    for(const f of new Set(no.map(x=>x.feature)))evidence[f].negative++;
  }
  const weights=Object.fromEntries(AXES.map(({id})=>[id,Math.round(100*(1+evidence[id].positive)/(2+evidence[id].positive+evidence[id].negative))]));
  return {weights,evidence,items,effective};
}

export function nextPair(catalog,history=[],excluded=[]) {
  const model=learn(catalog,history);
  const used=new Set(history.map(h=>[h.left,h.right].sort().join('|')));
  let best=null,score=-Infinity;
  const blocked=new Set(excluded);
  for(let i=0;i<catalog.items.length;i++)for(let j=i+1;j<catalog.items.length;j++){
    const l=catalog.items[i],r=catalog.items[j];
    if(blocked.has(l.id)||blocked.has(r.id))continue;
    if(used.has([l.id,r.id].sort().join('|')))continue;
    const exposure=model.evidence[l.feature].seen+model.evidence[r.feature].seen;
    const itemExposure=model.items[l.id].seen+model.items[r.id].seen;
    const value=(l.feature!==r.feature?8:0)-exposure*2-itemExposure*3-Math.abs(model.weights[l.feature]-model.weights[r.feature])/100;
    if(value>score){score=value;best=[l,r];}
  }
  return best;
}

export function recommendations(catalog,history,overrides={},excluded=[]) {
  const model=learn(catalog,history);
  if(!Array.isArray(excluded)||new Set(excluded).size!==excluded.length||excluded.some(id=>!catalog.items.some(x=>x.id===id)))throw new Error('排除项必须为餐品集内不重复的 ID');
  for(const [k,v] of Object.entries(overrides))if(!axes.has(k)||!Number.isFinite(v)||v<0||v>100)throw new Error('手动偏好必须在 0—100 之间');
  const weights={...model.weights,...overrides};
  const blocked=new Set(excluded);
  const pool=catalog.items.filter(x=>!blocked.has(x.id) && model.items[x.id].negative===0);
  const value=x=>weights[x.feature]+model.items[x.id].positive*16;
  const ranked=[...pool].sort((a,b)=>value(b)-value(a)||a.id.localeCompare(b.id));
  const favorites=ranked.filter(x=>model.items[x.id].positive>0).slice(0,2);
  const favoriteIds=new Set(favorites.map(x=>x.id));
  const discovery=ranked.filter(x=>!favoriteIds.has(x.id) && model.items[x.id].positive===0).slice(0,2);
  return {model,weights,favorites,discovery,excluded:blocked,ranked};
}

export function summarize(catalog,history,overrides={},excluded=[]) {
  const result=recommendations(catalog,history,overrides,excluded);
  const top=AXES.filter(a=>result.weights[a.id]>50 && (result.model.evidence[a.id].positive>0 || Object.hasOwn(overrides,a.id))).sort((a,b)=>result.weights[b.id]-result.weights[a.id]);
  const lead=top[0];
  return {...result,title:lead?`${lead.short}，今天由你定义。`:Object.values(result.model.items).some(x=>x.positive>0)?'偏爱不止一种，慢慢选就好。':'还没找到偏爱，也没关系。',
    subtitle:result.model.effective===0?'你还没有提供有效选择；可以继续实验，或直接手动调整。':`这张图来自 ${result.model.effective} 次有效选择。它只描述本轮倾向，随时可以改。`};
}

export function sessionDocument(catalog,history,overrides={},excluded=[]) {
  if(history.length>6)throw new Error('单次实验最多为 6 轮');
  learn(catalog,history);recommendations(catalog,history,overrides,excluded);
  return {version:1,catalog,history,overrides,excluded};
}

export function restoreSession(doc) {
  if(!doc||doc.version!==1)throw new Error('不支持的实验记录版本');
  sessionDocument(doc.catalog,doc.history,doc.overrides||{},doc.excluded||[]);
  return doc;
}

export function preferenceSVG(result) {
  const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const bars=AXES.map((a,i)=>`<text x="56" y="${236+i*56}" fill="#312b27" font-size="17">${safe(a.label)}</text><rect x="190" y="${221+i*56}" width="300" height="12" rx="6" fill="#eee5d6"/><rect x="190" y="${221+i*56}" width="${3*result.weights[a.id]}" height="12" rx="6" fill="${i%2?'#ffbc0d':'#da291c'}"/><text x="520" y="${236+i*56}" font-size="17" fill="#312b27">${result.weights[a.id]}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="680" viewBox="0 0 640 680"><rect width="640" height="680" rx="28" fill="#fff8e9"/><rect width="640" height="12" fill="#da291c"/><g font-family="Microsoft YaHei,Arial,sans-serif"><text x="56" y="70" font-size="14" letter-spacing="3" fill="#da291c">McTASTE LAB / 麦麦偏爱实验室</text><text x="56" y="132" font-size="32" font-weight="700" fill="#312b27">${safe(result.title)}</text><text x="56" y="175" font-size="14" fill="#7e746b">基于 ${result.model.effective} 次有效选择 · 可编辑的本轮偏好</text>${bars}<text x="56" y="602" font-size="13" fill="#7e746b">倾向指数不代表科学测量、营养评价或真实喜好概率。</text><text x="56" y="632" font-size="13" fill="#7e746b">独立参赛作品，非麦当劳官方产品。数据来源见项目说明。</text></g></svg>`;
}
