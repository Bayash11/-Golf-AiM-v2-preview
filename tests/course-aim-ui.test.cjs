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

/* Regression: a mistaken short tap must not collapse the playable map window. */
const courseMapSource=extract("AimMap=function({hole:h,prevPos,aimPoint,pendingPoint,onTap,tapEnabled","/* ===== 2026-09-16 field usability patch ===== */");
function layoutFixture(){
 const P={
  useRef(initial){return {current:initial}},
  useState(initial){return [initial,()=>{}]},
  cloneElement(node,props){return {...node,props:{...node.props,...props}}}
 };
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const ctx=vm.createContext({
  AH,P,Dt:clamp,
  se:(x1,y1,x2,y2)=>Math.hypot(x1-x2,y1-y2),
  bu:()=>28,Yt:()=>0,aimFwWidthAt:()=>56,
  aimBand:()=>[],aimOrganic:()=>[],setTimeout:()=>{}
 });
 vm.runInContext('var AimMap;\n'+courseMapSource,ctx);
 const polygon=[{x:-30,y:0},{x:30,y:0},{x:30,y:405},{x:-30,y:405}];
 const hole={
  distance:405,par:4,terrain:'park',
  centerline:[{v:0,y:0},{v:10,y:405}],
  roughPoly:polygon,fairwayPoly:polygon,greenPoly:polygon,apronPoly:polygon,
  greenCenter:{x:0,y:392},pin:{x:0,y:392},
  green:{halfWidth:15,depth:20},
  water:null,trees:[],bunkers:[],obZones:[]
 };
 const prevPos={x:0,y:220};
 const draw=({aimPoint=null,zoom=false,tap=()=>{}}={})=>{
  const root=ctx.AimMap({hole,prevPos,aimPoint,onTap:tap,tapEnabled:true,zoom});
  const svg=collect(root,x=>x.tag==='svg'&&x.props.className==='aim-map-v2')[0];
  assert.ok(svg,'course map must render as an SVG');
  return {root,svg};
 };
 return {draw,hole,prevPos};
}
test('2nd-shot aim markers near or far preserve exactly the same entire course viewBox',()=>{
 const f=layoutFixture();
 const initial=f.draw();
 const nearby=f.draw({aimPoint:{x:8,y:225}});
 const toFairway=f.draw({aimPoint:{x:0,y:355}});
 const toGreen=f.draw({aimPoint:{x:0,y:392}});
 assert.equal(nearby.svg.props.viewBox,initial.svg.props.viewBox);
 assert.equal(toFairway.svg.props.viewBox,initial.svg.props.viewBox);
 assert.equal(toGreen.svg.props.viewBox,initial.svg.props.viewBox);
 assert.equal(nearby.svg.props.style.aspectRatio,initial.svg.props.style.aspectRatio);
 assert.equal(toGreen.svg.props.style.aspectRatio,initial.svg.props.style.aspectRatio);
 assert.ok(toFairway.svg.props.viewBox.endsWith('467'),'full hole height should stay visible');
 assert.doesNotMatch(courseMapSource,/focusCurrent|focusTarget|focusHeight/);
 assert.doesNotMatch(dpSource,/focusCurrent/);
});
test('nearby tap can be corrected by tapping far ahead without enlarging the course',()=>{
 const f=layoutFixture(),recorded=[];
 let view=f.draw({tap:(x,y)=>recorded.push({x,y})});
 const original=view.svg.props.viewBox;
 // Approximate iPhone map pixel geometry; the map element gives exact bounds.
 function tap(x,y){
  view.svg.props.ref.current={getBoundingClientRect:()=>({left:0,top:0,width:360,height:500})};
  view.svg.props.onClick({clientX:x,clientY:y});
  assert.equal(recorded.length>0,true);
  view=f.draw({aimPoint:recorded[recorded.length-1],tap:(xx,yy)=>recorded.push({x:xx,y:yy})});
  assert.equal(view.svg.props.viewBox,original,'tap must not resize/recenter the view');
 }
 tap(180,230);
 tap(180,38);
 assert.equal(recorded.length,2);
 assert.ok(recorded[1].y>recorded[0].y,'second tap should successfully move the aim toward the green');
 const zoom=f.draw({aimPoint:recorded[1],zoom:true});
 assert.notEqual(zoom.svg.props.viewBox,original,'user-selected green zoom is intentionally preserved');
});
