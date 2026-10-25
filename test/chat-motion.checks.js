export async function checkChatMotion() {
 const f=window.fixture, wait=ms=>new Promise(r=>setTimeout(r,ms));
 const check=(value,message)=>{if(!value)throw Error(message);};
 const scroll=()=>document.querySelector('.chat-scroller');
 const feed=()=>document.querySelector('.conversation-feed');
 f.session(0);f.empty(false);f.live(true);f.setContent('A live reply.');await wait(200);
 const s=scroll();
 s.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}));
 s.scrollTop-=200;s.dispatchEvent(new Event('scroll'));await wait(30);
 const top=s.scrollTop;f.setContent('A growing reply.\n'.repeat(60));await wait(350);
 check(Math.abs(s.scrollTop-top)<1,'stream must leave the history reader alone');
 check(Boolean(document.querySelector('.chat-jump-bottom')),'history reader needs a return button');
 f.session(1);await wait(50);f.session(0);await wait(100);
 check(Math.abs(scroll().scrollTop-top)<1,'switching sessions must restore scroll position');
 document.querySelector('.chat-jump-bottom').click();await wait(50);
 const target='New line.\n'.repeat(100);f.live(true);f.setContent(target);
 const samples=[];
 for(let i=0;i<12;i++){await wait(30);samples.push(scroll().scrollTop);}
 check(samples.every((p,i)=>i===0||p>=samples[i-1]-1),'spring must follow monotonically');
 await wait(500);
 check(scroll().scrollHeight-scroll().clientHeight-scroll().scrollTop<2,'spring must reach the last line');
 check(document.querySelector('.message-response.is-streaming').textContent.replace(/\s/g,'').startsWith(target.replace(/\s/g,'')),'stream must not hide received text');
 f.autoScroll(false);const disabledTop=scroll().scrollTop;f.setContent(target+'More lines.\n'.repeat(30));await wait(200);
 check(Math.abs(scroll().scrollTop-disabledTop)<1,'auto-scroll preference must be respected');f.autoScroll(true);
 f.reasoning('Detailed reasoning retained for inspection.');
 f.tools([{id:'read',name:'fs_read',input:{path:'example.txt'},status:'running'}]);await wait(50);
 check(document.querySelector('.response-trace').dataset.open==='true','working details must open while tools run');
 const reasoningToggle=document.querySelector('.trace-row-toggle');
 if(reasoningToggle?.getAttribute('aria-expanded')==='false'){reasoningToggle.click();await wait(250);}
 check(document.querySelector('.trace-body').textContent.includes('Detailed reasoning'),'reasoning must remain inspectable');
 f.live(false);await wait(50);
 const textarea=document.querySelector('.composer-shell textarea');
 const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
 setter.call(textarea,'Unsent Vietnamese draft: giữ nguyên');textarea.dispatchEvent(new Event('input',{bubbles:true}));await wait(30);
 f.session(1);await wait(40);f.session(0);await wait(40);
 check(document.querySelector('.composer-shell textarea').value==='Unsent Vietnamese draft: giữ nguyên','draft must survive a session switch');
 f.empty(true);await wait(80);
 const bottom=document.querySelector('.chat-composer-region').getBoundingClientRect().bottom;
 check(Math.abs(bottom-window.innerHeight)<2,'empty chat input must stay at the bottom');
 f.empty(false);
 check(document.querySelector('.chat-composer-region').getAnimations().length===0,'starting a conversation must keep the input still');
 check(Math.abs(document.querySelector('.chat-composer-region').getBoundingClientRect().bottom-bottom)<2,'first message must preserve the input bottom edge');
 f.animated(false);f.empty(true);await wait(20);f.empty(false);
 check(document.querySelector('.chat-composer-region').getAnimations().length===0,'disabled motion must dock immediately');f.animated(true);
 check(!feed().style.transform,'interrupted following must leave no transcript transform');
 return {historyStable:true,scrollRestored:true,springSettled:true,autoScrollRespected:true,draftRestored:true,activityInspectable:true,bottomAnchored:true};
}
