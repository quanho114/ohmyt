document.documentElement.classList.add('toolbar-'+(new URLSearchParams(location.search).get('toolbar')||'default'));
const tabs=document.querySelector('#tabs'),address=document.querySelector('#address');
let currentUrl='';
let lastTabs='';
let lastActive;
let lastExpanded;
let editing=false;
let navigationId=0;
let draft=null;
function compactUrl(value){try{return new URL(value).host;}catch{return value;}}
function showAddress(){address.value=draft??(editing?currentUrl:compactUrl(currentUrl));address.title=currentUrl;address.classList.toggle('editing',editing);}
function icon(paths){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');for(const d of paths){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}return svg;}
const expand=document.querySelector('#expand');
if(expand)expand.onclick=()=>browserUI.command('expand');
const stopControl=document.querySelector('#stop-computer');
if(stopControl)stopControl.onclick=()=>browserUI.command('stop');
const filesControl=document.querySelector('#browser-files');
if(filesControl)filesControl.onclick=()=>browserUI.command('files');
function render(state){
 if(lastActive!==undefined && lastActive!==state.active){draft=null;editing=false;}
 lastActive=state.active;
 const stop=document.querySelector('#stop-computer');if(stop){stop.hidden=!state.computerBusy;stop.title='AI đang điều khiển · Dừng';}
 if(filesControl){filesControl.hidden=!state.features?.canFiles;filesControl.dataset.ready=String(Boolean(state.features?.enabled && state.features?.installed));filesControl.title='File trình duyệt · Browser Use '+(state.features?.enabled ? state.features?.installed ? 'đã bật' : 'thiếu runtime' : 'chưa bật');}
 if(expand && lastExpanded!==Boolean(state.expanded)){lastExpanded=Boolean(state.expanded);const label=state.expanded?'Thu nhỏ về cạnh chat':'Phóng to trình duyệt';expand.title=label;expand.setAttribute('aria-label',label);expand.setAttribute('aria-pressed',String(Boolean(state.expanded)));expand.replaceChildren(icon(state.expanded?['M3 8h5V3M21 8h-5V3M8 21v-5H3M16 21v-5h5']:['M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5']));}

 const tabSignature=JSON.stringify([state.tabs,state.active]);
 if(tabSignature!==lastTabs){
 lastTabs=tabSignature;
 tabs.replaceChildren();
 for(const tab of state.tabs){
  const item=document.createElement('div');item.className='tab'+(tab.id===state.active?' selected':'');
  const select=document.createElement('button');select.className='select-tab';select.setAttribute('role','tab');select.setAttribute('aria-selected',String(tab.id===state.active));
  const label=document.createElement('span');label.className='tab-label';label.textContent=tab.title;
  select.append(icon(['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18','M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18']),label);select.title=tab.url;select.onclick=()=>browserUI.command('select',tab.id);
  const close=document.createElement('button');close.className='close-tab';close.append(icon(['m7 7 10 10M17 7 7 17']));close.title='Đóng tab';close.setAttribute('aria-label','Đóng tab '+tab.title);close.onclick=()=>browserUI.command('close',tab.id);item.append(select,close);tabs.append(item);
 }
 const add=document.createElement('button');add.className='add-tab';add.append(icon(['M12 5v14M5 12h14']));add.title='Tab mới';add.setAttribute('aria-label','Tab mới');add.onclick=()=>browserUI.command('new');tabs.append(add);
 }
 document.getElementById('back').disabled=!state.canGoBack;document.getElementById('forward').disabled=!state.canGoForward;
 currentUrl=state.tabs.find(t=>t.id===state.active)?.url||'';if(!editing)showAddress();
}

browserUI.onState(render);
for(const action of ['back','forward','reload'])document.getElementById(action).onclick=()=>browserUI.command(action);
document.getElementById('navigation').onsubmit=async event=>{
 event.preventDefault();
 const id=++navigationId;
 const target=editing?address.value:(draft??currentUrl);
 address.setCustomValidity('');draft=null;editing=false;address.blur();
 try{const state=await browserUI.command('navigate',target);if(id===navigationId)render(state);}
 catch(error){if(id===navigationId){address.setCustomValidity(error.message);address.reportValidity();}}
};
browserUI.command('state').then(render);

address.addEventListener('input',()=>{draft=address.value;address.setCustomValidity('');});

address.addEventListener('focus',()=>{editing=true;showAddress();address.select();});
address.addEventListener('blur',()=>{editing=false;showAddress();});
address.addEventListener('keydown',event=>{if(event.key==='Escape'){draft=null;address.setCustomValidity('');address.blur();}});

document.querySelector('.go-button').addEventListener('mousedown',event=>event.preventDefault());
