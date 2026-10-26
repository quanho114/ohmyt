const vm=require('node:vm');const fs=require('node:fs');const assert=require('node:assert/strict');
const elements=new Map();
const element=()=>({value:'',classList:{toggle(){}},handlers:{},setAttribute(){},append(){},replaceChildren(){},setCustomValidity(){},reportValidity(){},select(){},addEventListener(name,fn){this.handlers[name]=fn;},blur(){this.handlers.blur?.();}});
for(const key of ['#tabs','#address','#navigation','#back','#forward','#reload','.go-button'])elements.set(key,element());
let resolveNavigation,renderState;const calls=[];
const context={location:{search:''},URLSearchParams,document:{documentElement:{classList:{add(){}}},querySelector:s=>elements.get(s),getElementById:s=>elements.get('#'+s),createElement:element,createElementNS:element},URL,browserUI:{onState(callback){renderState=callback;},command:async(action,value)=>{if(action==='state')return {tabs:[],active:null};calls.push({action,value});return new Promise(r=>resolveNavigation=r);}}};
vm.runInNewContext(fs.readFileSync('electron/browser-ui.js','utf8'),context);
// Exercise the production native attach/theme/disposal boundary without Electron.
{
 const {EventEmitter}=require('node:events');
 const theme=new EventEmitter();theme.shouldUseDarkColors=false;
 class View {
  constructor(){this.children=[];this.visible=true;this.bounds={};this.colors=[];this.webContents=new EventEmitter();Object.assign(this.webContents,{loadFile(){},close(){},send(){}});}
  setBorderRadius(){} setBackgroundColor(color){this.colors.push(color);} getBounds(){return this.bounds;} setBounds(bounds){this.bounds=bounds;}
  getVisible(){return this.visible;} setVisible(value){this.visible=value;} addChildView(view){this.children.push(view);}
 }
 const loaded={exports:{}};
 vm.runInNewContext(fs.readFileSync('electron/browser.cjs','utf8'),{require(name){
  if(name==='electron')return {View,WebContentsView:View,nativeTheme:theme,ipcMain:{handle(){}}};
  if(name==='path')return require(name);
  if(name==='./branding.cjs')return {};
  return new Proxy({},{get:()=>class {}});
 },module:loaded,__dirname:require('node:path').resolve('electron')});
 const browser=new loaded.exports.IntegratedBrowser(),host=new EventEmitter();host.contentView=new View();
 browser.computer.busy=new Map();browser.computer.externalOwners=new Map();
 browser.attach(host,{x:0,y:0,width:600,height:400},false);
 assert.deepEqual(browser.controls.colors,['#ffffff','#ffffff']);
 assert.deepEqual(browser.actions.colors,['#ffffff']);
 theme.shouldUseDarkColors=true;theme.emit('updated');
 assert.equal(browser.controls.colors.at(-1),'#242426');
 assert.equal(browser.actions.colors.at(-1),'#242426');
 host.emit('closed');assert.equal(theme.listenerCount('updated'),0,'theme listener must not retain a closed host');
 console.log('PASS native toolbar boundary: opaque light/dark surfaces and theme listener disposal (mock Electron)');
}
(async()=>{await Promise.resolve();const address=elements.get('#address'),form=elements.get('#navigation');address.handlers.focus();address.value='orca';address.handlers.input();renderState({tabs:[],active:null});assert.equal(address.value,'orca');address.handlers.blur();assert.equal(address.value,'orca');address.handlers.focus();assert.equal(address.value,'orca');const first=form.onsubmit({preventDefault(){}});assert.equal(calls[0].value,'orca');address.handlers.focus();address.value='bất kỳ từ khóa';address.handlers.input();const second=form.onsubmit({preventDefault(){}});assert.equal(calls[1].value,'bất kỳ từ khóa');resolveNavigation({tabs:[],active:null});await second;console.log('PASS address: search input preserved, new search allowed while previous page loads');})().catch(error=>{console.error(error);process.exitCode=1;});
