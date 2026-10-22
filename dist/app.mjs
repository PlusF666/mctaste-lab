import {AXES,validateCatalog,nextPair,learn,summarize,sessionDocument,restoreSession,preferenceSVG} from './engine.mjs';
const $=s=>document.querySelector(s);
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const STORAGE='mctaste-lab:v1';
let catalog,history=[],overrides={},excluded=[],pair=null,result=null,toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200);}
function scrollTo(selector){$(selector).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
function download(text,filename,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=node('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function image(item,cls=''){const img=node('img',cls);img.alt=item.name;if(item.image)img.src=item.image;else img.src='assets/golden-arches.svg';img.loading='lazy';img.addEventListener('error',()=>{if(!img.src.endsWith('golden-arches.svg'))img.src='assets/golden-arches.svg';},{once:true});return img;}

async function loadDemo(){const res=await fetch('catalog.json');if(!res.ok)throw new Error('餐品集加载失败');applyCatalog(await res.json());}
function applyCatalog(next){validateCatalog(next);catalog=next;history=[];overrides={};excluded=[];$('#results').hidden=true;syncSource();renderPair();}
function syncSource(){
  $('#source-pill').replaceChildren(node('i'),document.createTextNode(catalog.source==='mcp'?'MCP 导入 · 管理 ↗':'官网体验集 · 管理 ↗'));
  $('#data-boundary').textContent=catalog.source==='mcp'?`${catalog.context.store_name} · ${catalog.context.dining_mode} · 采集时间 ${catalog.captured_at}。导入来源由采集者声明，当前供应与支付价格仍需官方渠道确认。`:'体验餐品名称与图片来自官网，非实时门店菜单；不显示未经核验的价格。点餐前以官方渠道为准。';
}
function renderPair(){
  pair=history.length<6?nextPair(catalog,history,excluded):null;
  $('#round-number').textContent=String(Math.min(history.length+1,6)).padStart(2,'0');
  $('#progress').style.width=`${Math.min(history.length/6,1)*100}%`;
  $('.progress-track').setAttribute('aria-label',`已完成 ${history.length} / 6 轮`);
  $('#undo').disabled=history.length===0;$('#early-results').disabled=history.length===0;
  $('#pair-area').hidden=!pair;$('#alternate-choices').hidden=!pair;$('#finished-panel').hidden=!!pair;
  if(!pair){
    $('#finished-panel h3').textContent=history.length>=6?'你的偏爱，已经有了轮廓。':'可比较的餐品不够了。';
    $('#finished-panel p').textContent=history.length>=6?'现在可以看看本轮结果，也可以回到上一轮修改选择。':'可以在餐品库恢复一些选择，或查看现有结果。';
    if(history.length>0){renderReport();$('#results').hidden=false;}
    return;
  }
  for(const [side,item] of [['left',pair[0]],['right',pair[1]]]){
    $('#'+side+'-category').textContent=AXES.find(a=>a.id===item.feature).label;
    $('#'+side+'-name').textContent=item.name;$('#'+side+'-caption').textContent=item.caption||'凭直觉选，你的答案就很好。';
    const img=$('#'+side+'-image');img.src=item.image||'assets/golden-arches.svg';img.alt=item.name;
    $('#choose-'+side).setAttribute('aria-label',`选择${side==='left'?' A':' B'}：${item.name}`);
  }
  $('#experiment-note').textContent=history.length?`已留下 ${history.length} 轮选择。你可以随时撤销，或先看看当前偏好。`:'先做选择，再看结果。没有倒计时，慢慢来也可以。';
}
function choose(choice){if(!pair)return;history.push({left:pair[0].id,right:pair[1].id,choice});renderPair();if(history.length===6){toast('6 轮实验完成，你的偏好报告已生成');scrollTo('#results');}}
function showResults(){if(!catalog)return;if(history.length===0){toast('先选一轮，让偏好有迹可循');scrollTo('#experiment');return;}renderReport();$('#results').hidden=false;scrollTo('#results');}
function radar(weights){
  const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 340 270');svg.setAttribute('aria-hidden','true');
  const cx=170,cy=137,r=95;
  const pos=(i,scale=1)=>{const angle=-Math.PI/2+i*Math.PI/3;return [cx+Math.cos(angle)*r*scale,cy+Math.sin(angle)*r*scale];};
  for(const scale of [.25,.5,.75,1]){const p=document.createElementNS(ns,'polygon');p.setAttribute('points',AXES.map((_,i)=>pos(i,scale).join(',')).join(' '));p.setAttribute('fill','none');p.setAttribute('stroke','#eb7967');p.setAttribute('stroke-width','.65');svg.append(p);}
  AXES.forEach((a,i)=>{const [x,y]=pos(i);const line=document.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1:cx,y1:cy,x2:x,y2:y,stroke:'#eb7967','stroke-width':.65}))line.setAttribute(k,v);svg.append(line);const [tx,ty]=pos(i,1.22);const text=document.createElementNS(ns,'text');text.setAttribute('x',tx);text.setAttribute('y',ty+3);text.setAttribute('text-anchor','middle');text.textContent=a.short;svg.append(text);});
  const fill=document.createElementNS(ns,'polygon');fill.setAttribute('points',AXES.map((a,i)=>pos(i,weights[a.id]/100).join(',')).join(' '));fill.setAttribute('fill','#ffbc0d55');fill.setAttribute('stroke','#ffcf4b');fill.setAttribute('stroke-width','2.5');svg.append(fill);
  AXES.forEach((a,i)=>{const [x,y]=pos(i,weights[a.id]/100);const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r',3);dot.setAttribute('fill','#ffe292');svg.append(dot);});
  $('#radar').replaceChildren(svg);$('#radar').setAttribute('aria-label',AXES.map(a=>`${a.label}倾向指数 ${weights[a.id]}`).join('，'));
}
function renderSliders(){
  $('#sliders').replaceChildren();
  for(const a of AXES){
    const row=node('label','slider-row');const label=node('span','slider-label',a.label);const badge=node('small','',Object.hasOwn(overrides,a.id)?'手动调整':result.model.evidence[a.id].positive+result.model.evidence[a.id].negative>0?'本轮选择':'中性起点');badge.id=`manual-${a.id}`;label.append(badge);
    const input=node('input');input.type='range';input.min=0;input.max=100;input.value=result.weights[a.id];input.setAttribute('aria-label',`${a.label}倾向`);
    const output=node('span','slider-value',result.weights[a.id]);output.id=`value-${a.id}`;
    input.addEventListener('input',()=>{overrides[a.id]=Number(input.value);output.textContent=input.value;badge.textContent='手动调整';renderReport(false);});
    row.append(label,input,output);$('#sliders').append(row);
  }
}
function recoList(target,items,empty){
  const list=$(target);list.replaceChildren();
  if(!items.length){list.append(node('div','reco-empty',empty));return;}
  for(const item of items){
    const card=node('article','reco-item');card.append(image(item));const content=node('div');content.append(node('strong','',item.name));
    const reason=Object.hasOwn(overrides,item.feature)?'依据你手动调整后的类别倾向':result.model.items[item.id].positive>0?'你在本轮明确选择过它':`来自你的${AXES.find(a=>a.id===item.feature).short}倾向，尚未在本轮选中`;
    content.append(node('p','',reason));const exclude=node('button','','暂时不想吃');exclude.setAttribute('aria-label',`暂时排除${item.name}`);exclude.addEventListener('click',()=>{excluded=[...new Set([...excluded,item.id])];renderReport(false);renderPair();toast('已排除此餐品，可在餐品库恢复');});content.append(exclude);card.append(content,node('span','tiny-arrow','↗'));list.append(card);
  }
}
function renderHistory(){
  const byId=new Map(catalog.items.map(x=>[x.id,x.name]));const labels={left:'选了 A',right:'选了 B',both:'两个都想要',neither:'这轮都不心动',skip:'跳过这轮'};
  $('#history-list').replaceChildren(...history.map(h=>node('li','',`${byId.get(h.left)} / ${byId.get(h.right)} → ${labels[h.choice]}`)));$('#history-count').textContent=`${history.length} 轮`;
}
function renderReport(sliders=true){
  result=summarize(catalog,history,overrides,excluded);$('#profile-title').textContent=result.title;$('#profile-subtitle').textContent=result.subtitle;
  $('#effective-count').textContent=`${String(result.model.effective).padStart(2,'0')} CHOICES`;radar(result.weights);if(sliders)renderSliders();
  recoList('#favorites',result.favorites,'还没有明确选中的心动款。跳过也没关系，你可以回去再选一次。');
  recoList('#discovery',result.discovery,'可探索的餐品暂时不够；可以在餐品库恢复一些候选。');renderHistory();
}
function renderCatalog(){
  $('#catalog-grid').replaceChildren();$('#catalog-count').textContent=`${catalog.items.length-excluded.length} 个候选 / 共 ${catalog.items.length} 个餐品`;
  for(const item of catalog.items){
    const blocked=excluded.includes(item.id);const button=node('button','catalog-item'+(blocked?' excluded':''));button.setAttribute('aria-pressed',String(!blocked));button.append(image(item),node('strong','',item.name),node('span','',blocked?'已排除 · 点击恢复':'可参与 · 点击排除'));
    button.addEventListener('click',()=>{excluded=blocked?excluded.filter(id=>id!==item.id):[...excluded,item.id];renderCatalog();renderPair();if(!$('#results').hidden)renderReport();});$('#catalog-grid').append(button);
  }
}
function restart(){history=[];overrides={};$('#results').hidden=true;renderPair();scrollTo('#experiment');toast('新一轮实验开始，餐品排除设置保留');}
function documentState(){return sessionDocument(catalog,history,overrides,excluded);}
function applySession(doc){const checked=restoreSession(doc);catalog=checked.catalog;history=checked.history;overrides=checked.overrides||{};excluded=checked.excluded||[];syncSource();renderPair();if(history.length){renderReport();$('#results').hidden=false;}else $('#results').hidden=true;}

$('#start').addEventListener('click',()=>scrollTo('#experiment'));$('#closing-start').addEventListener('click',()=>scrollTo('#experiment'));
for(const [id,choice] of [['choose-left','left'],['choose-right','right'],['both','both'],['neither','neither'],['skip','skip']])$('#'+id).addEventListener('click',()=>choose(choice));
$('#undo').addEventListener('click',()=>{if(!history.length)return;history.pop();renderPair();if(!$('#results').hidden)renderReport();toast('已撤销上一轮，倾向同步回滚');});
$('#early-results').addEventListener('click',showResults);$('#see-results').addEventListener('click',showResults);$('#report-nav').addEventListener('click',showResults);
$('#restart').addEventListener('click',restart);
$('#reset-overrides').addEventListener('click',()=>{overrides={};renderReport();toast('已恢复为本轮选择产生的偏好');});
$('#open-catalog').addEventListener('click',()=>{if(!catalog)return;renderCatalog();$('#catalog-dialog').showModal();});
$('#source-pill').addEventListener('click',()=>{if(!catalog)return;renderCatalog();$('#catalog-dialog').showModal();});
$('#clear-exclusions').addEventListener('click',()=>{excluded=[];renderCatalog();renderPair();if(!$('#results').hidden)renderReport();});
for(const b of document.querySelectorAll('.close-dialog'))b.addEventListener('click',()=>b.closest('dialog').close());
$('#about').addEventListener('click',()=>$('#about-dialog').showModal());
$('#import-data').addEventListener('click',()=>{$('#import-error').textContent='';$('#file-import').value='';$('#import-dialog').showModal();});
$('#file-import').addEventListener('change',async()=>{
  try{const f=$('#file-import').files[0];if(!f)return;if(f.size>2_000_000)throw new Error('文件不能超过 2 MB');const doc=JSON.parse((await f.text()).replace(/^\uFEFF/,''));
    if(Object.hasOwn(doc,'history'))applySession(doc);else applyCatalog(doc);$('#import-dialog').close();scrollTo(history.length?'#results':'#experiment');toast('已在本地导入，原实验已替换');
  }catch(e){$('#import-error').textContent=e.message;}
});
$('#load-demo').addEventListener('click',async()=>{try{await loadDemo();$('#import-dialog').close();toast('已恢复官网餐品体验集');}catch(e){$('#import-error').textContent=e.message;}});
$('#save-local').addEventListener('click',()=>{try{localStorage.setItem(STORAGE,JSON.stringify(documentState()));$('#save-note').textContent='已保存在这台设备。可从“导入菜单 / 实验记录”恢复或在说明中清除。';toast('仅保存在这台设备，没有上传');}catch{toast('本机存储不可用，可改用导出实验记录');}});
$('#load-saved').addEventListener('click',()=>{try{const raw=localStorage.getItem(STORAGE);if(!raw)throw new Error('这台设备还没有保存实验记录');applySession(JSON.parse(raw));$('#import-dialog').close();toast('已恢复本机保存的实验');}catch(e){$('#import-error').textContent=e.message;}});
$('#clear-saved').addEventListener('click',()=>{try{localStorage.removeItem(STORAGE);$('#save-note').textContent='默认只在当前页面保留，不上传选择记录。';toast('已清除本项目的本机保存');}catch{toast('本机存储不可用');}});
$('#download-card').addEventListener('click',()=>{if(!result)return;download(preferenceSVG(result),'mctaste-preference.svg','image/svg+xml;charset=utf-8');toast('偏好卡已导出，图片不含私人门店或账号信息');});
$('#export-session').addEventListener('click',()=>{download(JSON.stringify(documentState(),null,2),'mctaste-session.json','application/json');toast('实验记录已导出，包含本次使用的菜单与选择');});
loadDemo().catch(e=>{$('#experiment-note').textContent=e.message+'。请通过 HTTP 启动此项目，不要直接双击 HTML。';toast('页面加载失败，请查看启动说明');});
