'use strict';
/* Live course-aim regression: header, map controls, club buttons, protected quit flow. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extract(a,b){
 const x=html.indexOf(a),y=html.indexOf(b,x);
 assert.ok(x>=0&&y>x,'missing code boundary '+a);
 return html.slice(x,y);
}
const mpSource=extract("const gaCourseStep02Style=document.createElement('style');","dp=function(props){");
const dpSource=extract("dp=function(props){","yp=function({selectedClub,onClub,clubs}){");
const clubSource=extract("yp=function({selectedClub,onClub,clubs}){","function gaCourseChoice(");
const AH=(tag,props,...children)=>({tag,props:props||{},children});
function collect(root,pred,out=[]){
 if(!root||typeof root!=='object')return out;
 if(pred(root))out.push(root);
 for(const n of root.children||[])collect(n,pred,out);
 return out;
}
const named=(root,cls)=>collect(root,n=>((n.props||{}).className||'').split(' ').includes(cls));
function label(node){
 if(node==null)return '';
 if(typeof node==='string'||typeof node==='number')return String(node);
 if(Array.isArray(node))return node.map(label).join('');
 return (node.children||[]).map(label).join('');
}
function fixture(){
 const actions=[];
 const document={
  createElement:()=>({id:'',textContent:''}),
  head:{appendChild(el){actions.push(['style',el.id,el.textContent])}},
  querySelector(){return null}
 };
 const window={__aimQuitToggle:()=>actions.push('toggle-quit')};
 let mode='normal';
 const P={Fragment:'fragment',useEffect(){},useRef(initial){return {current:initial}},useState(initial){return[mode,next=>{mode=typeof next==='function'?next(mode):next}]}};
 const ctx=vm.createContext({AH,document,window,P,AimMap:'aim-map',aimScoreText:d=>d===0?'E':d>0?'+'+d:String(d)});
 vm.runInContext('var mp,dp,yp,vp;\n'+mpSource+dpSource+clubSource,ctx);
 return {ctx,actions,document,window,getMode:()=>mode};
}
const hole={number:1,par:4,distance:405,pinLabel:'奥',green:{halfWidth:15,depth:23},features:[],strokes:0,penalty:0,lie:'FW',remaining:405};
test('3-column fixed header offers protected menu, title and small branding',()=>{
 const f=fixture(),view=f.ctx.mp({hole,current:hole,holeIdx:0,totalHoles:9,completedHoles:[]});
 const h=named(view,'ga-course-topbar')[0];
 assert.equal(h.tag,'header');
 assert.equal(h.children.length,3);
 assert.equal(label(h.children[0]),'‹ 戻る');
 assert.equal(label(h.children[1]),'狙い入力');
 assert.equal(label(h.children[2]),'GOLFAiM');
 assert.equal(h.children[0].props['aria-label'],'中断メニューを開く');
 h.children[0].props.onClick();
 assert.ok(f.actions.includes('toggle-quit'));
 assert.equal(label(named(view,'ga-course-topbar-progress')[0]),'コース想定1 / 9 H');
 assert.equal(label(named(view,'ga-course-hole-card')[0]).includes('405yd'),true);
 const style=f.actions.find(x=>Array.isArray(x)&&x[1]==='ga-course-step02-20261011');
 assert.ok(style);
 assert.match(style[2],/grid-template-columns:84px minmax\(0,1fr\) 84px/);
 assert.match(style[2],/\.ga-course-topbar/);
});
test('quit menu handler falls back to actual safe pause button without navigating away',()=>{
 const f=fixture(),calls=[];
 delete f.window.__aimQuitToggle;
 f.document.querySelector=selector=>selector.includes('.ga-course-playing > .aim-quit')?{click:()=>calls.push('real-quit-toggle')}:null;
 f.ctx.gaOpenCourseQuitMenu();
 assert.deepEqual(calls,['real-quit-toggle']);
 assert.match(html,/window\.__aimQuitToggle=fn/);
 assert.match(html,/途中の記録を保存して終了/);
 assert.match(html,/この練習を破棄して終了/);
});
test('hole metadata and running score remain intact',()=>{
 const f=fixture();
 const h={...hole,pinLabel:'ピン:中央'};
 const view=f.ctx.mp({hole:h,current:h,holeIdx:1,totalHoles:18,completedHoles:[{total:5,par:4}]});
 assert.match(label(view),/2 \/ 18 H/);
 assert.match(label(view),/\+1/);
 assert.match(label(view),/グリーン幅 30yd × 46yd/);
 assert.match(label(view),/ピン位置 中央/);
});
test('map views retain full course, green zoom and disable aim tapping only in overview',()=>{
 const f=fixture();
 const props={hole,aimPoint:{x:1,y:200},tapEnabled:true,onTap:()=>{},shots:[],prevPos:{x:0,y:0}};
 let screen=f.ctx.dp(props);
 const toolbar=named(screen,'ga-course-map-toolbar')[0];
 assert.equal(toolbar.children.length,2);
 assert.equal(toolbar.children[0].props['aria-pressed'],false);
 assert.equal(toolbar.children[1].props['aria-pressed'],false);
 assert.match(toolbar.children[0].props['aria-label'],/全体図/);
 assert.match(toolbar.children[1].props['aria-label'],/グリーン/);
 toolbar.children[0].props.onClick();
 assert.equal(f.getMode(),'overview');
 screen=f.ctx.dp(props);
 assert.equal(named(screen,'ga-course-overview').length,1);
 assert.equal(collect(screen,x=>x.tag==='aim-map')[0].props.tapEnabled,false);
 assert.match(label(named(screen,'ga-course-map-help')[0]),/通常表示/);
 named(screen,'ga-course-map-toolbar')[0].children[1].props.onClick();
 assert.equal(f.getMode(),'green');
 screen=f.ctx.dp(props);
 assert.equal(named(screen,'ga-course-zoom').length,1);
 assert.equal(collect(screen,x=>x.tag==='aim-map')[0].props.tapEnabled,true);
});
test('all registered clubs remain selectable and current club can be changed',()=>{
 const f=fixture(),clubs=['Dr','5W','3U','4U','5I','6I','7I','8I','9I','P','48°','52°','58°','MiniDr'];
 const chosen=[],cancel=[];
 const picker=f.ctx.yp({selectedClub:null,clubs,onClub:v=>chosen.push(v)});
 const buttons=named(picker,'ga-course-clubs')[0].children;
 assert.equal(buttons.length,14);
 buttons[0].props.onClick();buttons[13].props.onClick();
 assert.deepEqual(chosen,['Dr','MiniDr']);
 const selected=f.ctx.vp({club:'MiniDr',onCancel:()=>cancel.push('reset')});
 assert.match(label(selected),/使用クラブMiniDr/);
 named(selected,'ga-course-reset')[0].props.onClick();
 assert.deepEqual(cancel,['reset']);
});
test('phone-safe map and club controls, progress and target distance remain',()=>{
 const f=fixture();
 const css=f.actions.find(x=>Array.isArray(x)&&x[1]==='ga-course-step02-20261011')[2];
 assert.match(css,/\.ga-course-map-toolbar button\{min-height:44px/);
 assert.match(css,/\.ga-course-clubs button\{min-height:46px/);
 assert.match(css,/\.ga-course-reset\{min-height:44px/);
 assert.match(css,/\.ga-course-shot-strip \.remaining strong\{color:var\(--ga-blue\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(html,/ga-course-playing.*?onTap:ll/);
 assert.match(html,/hp=\s*function\(\{club,targetDistance,isApproach,plan,onPlanField,onStartHit,onClearAim\}\)/);
});