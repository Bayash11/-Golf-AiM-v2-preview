'use strict';
/* Course setup contract and suspended-session safety on the real index.html component. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const begin="const gaCourseSetupStyle=document.createElement('style');";
const end="/* =========================================================\n   GOLF AiM v2 — STEP8";
const first=html.indexOf(begin),last=html.indexOf(end,first);
assert.ok(first>=0&&last>first,'course setup must be present');
const source=html.slice(first,last);
const AH=(tag,props,...children)=>({tag,props:props||{},children});
function all(root,fn,out=[]){
 if(!root||typeof root!=='object')return out;
 if(fn(root))out.push(root);
 for(const item of root.children||[])all(item,fn,out);
 return out;
}
const named=(root,name)=>all(root,n=>((n.props||{}).className||'').split(' ').includes(name));
function textOf(n){
 if(n==null)return '';
 if(typeof n==='string'||typeof n==='number')return String(n);
 if(Array.isArray(n))return n.map(textOf).join(' ');
 return (n.children||[]).map(textOf).join(' ');
}
function fixture(hasActive=false){
 const actions=[];
 let holes=9,confirmResult=false,confirmText='';
 let css='';
 const ctx=vm.createContext({
  AH,
  document:{
   createElement(){return {textContent:''}},
   head:{appendChild(style){css=style.textContent}}
  },
  window:{confirm(message){confirmText=message;return confirmResult}},
  P:{useState(initial){return[holes,value=>{holes=value}]}},
  gaUseEdgeSwipeBack:()=>{},
  gaUseResetViewportOnMount:()=>actions.push('top'),
  GaBottomNav:()=>null
 });
 vm.runInContext('var Tp;\n'+source,ctx);
 const props={
  hasActive,onStart:n=>actions.push('start:'+n),
  onResume:()=>actions.push('resume'),onDiscard:()=>actions.push('discard'),
  onBack:()=>actions.push('back'),
  onHome:()=>actions.push('home'),onData:()=>actions.push('data'),onSettings:()=>actions.push('settings')
 };
 return {render:()=>ctx.Tp(props),props,actions,css,
  setConfirmation:v=>{confirmResult=v},
  getConfirmation:()=>confirmText
 };
}
test('header has back, centered title, small GOLF AiM logo and fixed 3-column layout',()=>{
 const x=fixture(),view=x.render();
 const header=named(view,'ga-course-setup-head')[0];
 assert.equal(header.tag,'header');
 assert.equal(header.children.length,3);
 assert.equal(textOf(header.children[0]),'‹ 戻る');
 assert.equal(textOf(header.children[1]),'コース想定');
 assert.equal(textOf(header.children[2]),'GOLFAiM');
 assert.equal(header.children[2].props['aria-label'],'GOLF AiM');
 header.children[0].props.onClick();
 assert.ok(x.actions.includes('back'));
 assert.match(x.css,/grid-template-columns:80px minmax\(0,1fr\) 80px/);
 assert.match(x.css,/\.ga-course-setup-head\{position:fixed/);
});
test('default 9H and selecting 3H or 18H passes unchanged hole counts to existing onStart',()=>{
 const x=fixture();
 let view=x.render();
 let buttons=named(view,'ga-course-length-card');
 assert.equal(buttons.length,3);
 assert.deepEqual(buttons.map(b=>textOf(b)),['3H短時間','9Hハーフ','18Hフル']);
 assert.deepEqual(buttons.map(b=>b.props['aria-pressed']),[false,true,false]);
 const start=()=>named(view,'ga-course-start')[0].props.onClick();
 assert.equal(named(view,'ga-course-start')[0].props.disabled,false);
 start();
 buttons[0].props.onClick();
 view=x.render();
 assert.deepEqual(named(view,'ga-course-length-card').map(b=>b.props['aria-pressed']),[true,false,false]);
 assert.match(textOf(named(view,'ga-course-note')[0]),/PAR3・PAR4・PAR5を1ホールずつ/);
 start();
 named(view,'ga-course-length-card')[2].props.onClick();
 view=x.render();
 start();
 assert.deepEqual(x.actions.filter(a=>a.startsWith('start:')),['start:9','start:3','start:18']);
});
test('active practice prevents accidental overwrite, but resume remains available',()=>{
 const x=fixture(true),view=x.render();
 assert.equal(named(view,'ga-course-resume').length,1);
 assert.match(textOf(view),/前回の続きがあります/);
 assert.match(textOf(view),/先に中断データを破棄/);
 const start=named(view,'ga-course-start')[0];
 assert.equal(start.props.disabled,true);
 start.props.onClick(); // Safety also enforced in callback, not just the button.
 assert.equal(x.actions.some(a=>a.startsWith('start:')),false);
 named(view,'ga-course-resume')[0].children[1].props.onClick();
 assert.ok(x.actions.includes('resume'));
});
test('discard requires explicit confirmation and warns that progress cannot be restored',()=>{
 const x=fixture(true),view=x.render();
 const discard=named(view,'discard')[0];
 x.setConfirmation(false);discard.props.onClick();
 assert.equal(x.actions.includes('discard'),false);
 x.setConfirmation(true);discard.props.onClick();
 assert.equal(x.actions.filter(v=>v==='discard').length,1);
 assert.match(x.getConfirmation(),/進行状況は元に戻せません/);
 x.props.hasActive=false;
 const released=x.render();
 assert.equal(named(released,'ga-course-start')[0].props.disabled,false);
 assert.equal(named(released,'ga-course-resume').length,0);
 named(released,'ga-course-start')[0].props.onClick();
 assert.ok(x.actions.includes('start:9'));
});
test('course setup no longer offers a history/results link in either state',()=>{
 for(const active of [false,true]){
  const view=fixture(active).render();
  assert.doesNotMatch(textOf(view),/過去の練習結果|過去のコース想定結果を見る/);
  assert.equal(named(view,'ga-course-history-link').length,0);
 }
 assert.doesNotMatch(source,/onHistory|ga-course-history-link/);
});
test('iPhone14 card sizes, safe padding, branding and bottom navigation remain',()=>{
 const x=fixture(),view=x.render();
 assert.match(x.css,/max-width:390px/);
 assert.match(x.css,/padding:calc\(var\(--ga-header-total\) \+ 22px\)/);
 assert.match(x.css,/calc\(var\(--ga-bottom-total\) \+ 30px\)/);
 assert.match(x.css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(x.css,/min-height:78px/);
 assert.match(x.css,/background:#FFF1E9/);
 assert.match(x.css,/background:var\(--ga-orange\)/);
 assert.match(x.css,/background:var\(--ga-blue\)/);
 assert.match(x.css,/\.ga-course-start:disabled/);
 assert.equal(all(view,n=>n.tag===x.render().tag).length>=1,true);
 assert.match(source,/AH\(GaBottomNav,\{active:'practice'/);
});
test('existing course generation, save and resumable navigation are preserved',()=>{
 assert.match(html,/let D=b=>\{let E=Tg\(b\)/);
 assert.match(html,/holeCount:b,pars:E/);
 assert.match(html,/e==="courseMenu"&&\(0,i.jsx\)\(Tp/);
 assert.match(html,/onResume:ct/);
 assert.match(html,/await gaPersistSession\("course"/);
 assert.match(html,/await R1\(\);o\(null\)/);
});