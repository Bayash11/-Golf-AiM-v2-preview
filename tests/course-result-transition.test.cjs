'use strict';
/* Course STEP03 viewport transitions + result lie overrides. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extract(begin,end){
 const a=html.indexOf(begin),b=html.indexOf(end,a);
 assert.ok(a>=0&&b>a,'source boundary '+begin);
 return html.slice(a,b);
}
const scrollSource=extract('function gaCourseTrainingScreenKey(hole){','dp=function(props){');
const lieSource=extract('function gaCourseLandingResult(hole,t){','/* refactor: removed shadowed pp assignment #1 */');
const resultSource=extract('pp=function(props){','const gaDailyAnalysisStyle=');
const AH=(tag,props,...children)=>({tag,props:props||{},children});
function collect(root,pred,out=[]){
 if(!root||typeof root!=='object')return out;
 if(pred(root))out.push(root);
 for(const child of root.children||[])collect(child,pred,out);
 return out;
}
const named=(root,cls)=>collect(root,x=>((x.props||{}).className||'').split(' ').includes(cls));
function flatten(n){
 if(n==null)return '';
 if(typeof n==='string'||typeof n==='number')return String(n);
 if(Array.isArray(n))return n.map(flatten).join('');
 return (n.children||[]).map(flatten).join('');
}
function scrollFixture(){
 const events=[];
 const ref={current:null};
 let lastDeps=null;
 const P={
  useRef(){return ref},
  useEffect(cb,deps){
   const x=JSON.stringify(deps);
   if(lastDeps!==x){lastDeps=x;cb()}
  }
 };
 const ctx=vm.createContext({
  AH,P,
  gaResetViewportTop(){events.push('top')},
  requestAnimationFrame(cb){cb()},
  setTimeout(cb){cb()},
  aimScoreText(v){return v===0?'E':v>0?'+'+v:String(v)},
  gaOpenCourseQuitMenu:()=>events.push('pause')
 });
 vm.runInContext('var mp;\n'+scrollSource,ctx);
 const hole={number:1,par:4,distance:405,pinLabel:'中央',green:{halfWidth:14,depth:17},features:[],shots:[],phase:'aiming',pendingShot:null};
 function render(h=hole){
  return ctx.mp({hole:h,current:h,holeIdx:(h.number||1)-1,totalHoles:9,completedHoles:[]});
 }
 return {events,hole,render,ctx};
}
function resultFixture(){
 const edits=[],events=[];
 const state=[],ctxVars={index:0};
 const P={
  useState(initial){
   const i=ctxVars.index++;
   if(!(i in state))state[i]=initial;
   return [state[i],next=>{state[i]=typeof next==='function'?next(state[i]):next}];
  }
 };
 const gaResultSection=(title,_,children)=>AH('section',{title},children);
 const ctx=vm.createContext({
  AH,P,
  gaShotEntryHeader:(kind,title,back)=>AH('header',{kind,title,onClick:back},title),
  gaShotEntryProgress:(mode,no)=>AH('div',{mode,no},mode),
  gaImpactSelections:p=>p.contactImpact||[],
  gaFeedbackEnabled:k=>k==='good'?['芯で打てた']:['力んだ'],
  gaResultSection,
  gaResultDistanceEditor:()=>AH('distance',{}),
  gaResultLateralEditor:()=>AH('lateral',{}),
  gaResultCurveEditor:()=>AH('curve',{}),
  gaResultImpactEditor:()=>AH('impact',{}),
  gaResultButtonGrid:(items,chosen,cb)=>AH('button-grid',{chosen,onChange:cb}),
  gaRowsFromLabels:labels=>labels,
  gaCourseLandingResult:(hole,p)=>AH('div',{className:'landing-result'},p.overrideLie??p.computed.lie),
  gaResultEntryFooter:(t,imp,caption,callback)=>AH('button',{className:'submit',onClick:callback},caption),
  se:()=>150
 });
 vm.runInContext('var pp;\n'+lieSource.slice(lieSource.indexOf('function gaCourseResultLieOptions('))+'\n'+resultSource,ctx);
 const hole={prevPos:{x:0,y:0},aimPoint:{x:0,y:180},strokes:0,penalty:0,number:1};
 const pending={targetDistance:180,forward:175,lateral:5,club:'7I',curveBase:'フェード',style:'ライン出し',resultCurve:'フェード',contactImpact:[],contactPositive:[],contactOther:[],computed:{lie:'フェアウェイ',remaining:25},overrideLie:null};
 const props={
  hole,pending,
  onBackToAim:()=>events.push('back'),onCancel:()=>events.push('cancel'),
  onField:(field,v)=>edits.push([field,v]),
  onOverrideLie:(value)=>{pending.overrideLie=value;edits.push(['overrideLie',value])},
  onTogglePositive:v=>edits.push(['good',v]),
  onToggleOther:v=>edits.push(['miss',v]),
  onConfirm:()=>events.push('confirm')
 };
 const render=()=>{ctxVars.index=0;return ctx.pp(props)};
 return {render,edits,events,pending,props,ctx};
}
test('course practice initial entry and each distinct view transition reset to the top',()=>{
 const x=scrollFixture();
 x.render();assert.equal(x.events.filter(e=>e==='top').length,3);
 x.render();assert.equal(x.events.filter(e=>e==='top').length,3);
 x.hole.pendingShot={forward:200};
 x.render();assert.equal(x.events.filter(e=>e==='top').length,6,'aim -> result');
 x.hole.pendingShot.forward=195;
 x.render();assert.equal(x.events.filter(e=>e==='top').length,6,'same-screen input selection must not scroll');
 x.hole.pendingShot=null;
 x.render();assert.equal(x.events.filter(e=>e==='top').length,9,'result -> aim');
 x.hole.shots.push({club:'7I'});
 x.render();assert.equal(x.events.filter(e=>e==='top').length,12,'confirmed next shot');
 x.hole.phase='done';
 x.render();assert.equal(x.events.filter(e=>e==='top').length,15,'hole finish');
 x.hole.number=2;x.hole.shots=[];x.hole.phase='aiming';
 x.render();assert.equal(x.events.filter(e=>e==='top').length,18,'next hole');
});
test('same view does not scroll when club/aim/impact, curve or lie values change',()=>{
 const x=scrollFixture();x.render();
 const count=x.events.length;
 x.hole.selectedClub='7I';x.hole.aimPoint={x:0,y:150};
 x.hole.plan={curveBase:'フェード',style:'ライン出し'};
 x.render();
 assert.equal(x.events.length,count);
 x.hole.pendingShot={forward:145,contactImpact:['良い','下目']};
 x.render();
 const resultTop=x.events.length;
 x.hole.pendingShot.contactImpact=['普通','ヒール','下目'];
 x.hole.pendingShot.overrideLie='OB';
 x.render();
 assert.equal(x.events.length,resultTop);
});
test('course header uses existing safe pause menu and hole score is still displayed',()=>{
 const x=scrollFixture(),view=x.render();
 const header=named(view,'ga-course-topbar')[0];
 header.children[0].props.onClick();
 assert.ok(x.events.includes('pause'));
 assert.match(flatten(view),/Hole1Par4\s*405yd現在E/);
});
test('lie override offers all supported course terrain names, 44px controls and automatic fallback',()=>{
 const x=resultFixture();
 let view=x.render();
 assert.equal(named(view,'ga-course-lie-options').length,0);
 named(view,'ga-course-lie-edit')[0].props.onClick();
 view=x.render();
 const picker=named(view,'ga-course-lie-options')[0];
 assert.equal(picker.children.length,8);
 assert.equal(picker.children.find(v=>flatten(v)==='FW').props['aria-pressed'],true);
 const ob=picker.children.find(v=>flatten(v)==='OB');
 ob.props.onClick();
 assert.equal(x.pending.overrideLie,'OB');
 view=x.render();
 assert.match(flatten(view),/1罰打/);
 assert.match(flatten(view),/3打目/);
 assert.match(flatten(named(view,'submit')[0]),/3打目へ/);
 const auto=named(view,'ga-course-lie-auto')[0];assert.ok(auto);
 auto.props.onClick();assert.equal(x.pending.overrideLie,null);
 view=x.render();
 assert.equal(named(view,'ga-course-lie-auto').length,0);
 assert.equal(named(view,'ga-course-penalty').length,0);
 assert.match(flatten(named(view,'submit')[0]),/次へ/);
 assert.match(html,/\.ga-course-lie-options button\{min-width:0;min-height:44px/);
});
test('OB or pond override uses penalty, green override does not change score functions',()=>{
 const x=resultFixture();
 x.pending.overrideLie='池';
 let view=x.render();assert.match(flatten(named(view,'ga-course-penalty')[0]),/池｜1罰打/);
 x.pending.overrideLie='グリーン';
 view=x.render();
 assert.equal(named(view,'ga-course-penalty').length,0);
 assert.match(flatten(named(view,'submit')[0]),/記録して次へ/);
 assert.match(html,/O=E.overrideLie\?\?E.computed.lie/);
 assert.match(html,/j=O==="OB"\|\|O==="\\u6C60"/);
 assert.match(html,/onOverrideLie:J/);
});
test('Good/miss callbacks and original result input remain available',()=>{
 const x=resultFixture(),view=x.render();
 const grids=collect(view,n=>n.tag==='button-grid');
 assert.equal(grids.length,2);
 grids[0].props.onChange('芯で打てた');
 grids[1].props.onChange('力んだ');
 assert.deepEqual(x.edits,[['good','芯で打てた'],['miss','力んだ']]);
 assert.equal(collect(view,n=>n.tag==='distance').length,1);
 assert.equal(collect(view,n=>n.tag==='lateral').length,1);
 assert.equal(collect(view,n=>n.tag==='curve').length,1);
 assert.equal(collect(view,n=>n.tag==='impact').length,1);
 named(view,'submit')[0].props.onClick();
 assert.deepEqual(x.events,['confirm']);
 view.children[0].props.onClick();
 assert.deepEqual(x.events,['confirm','back']);
});
test('automatic lie preview respects manual override without changing landing geometry',()=>{
 const ctx=vm.createContext({
  AH,AimMap:'map',
  ui:(prev,forward,lateral)=>({x:lateral,y:forward}),
  document:{},P:{}
 });
 vm.runInContext(lieSource,ctx);
 const hole={prevPos:{x:0,y:0},aimPoint:{x:0,y:200}};
 const pending={targetPosition:hole.aimPoint,forward:175,lateral:7,overrideLie:null,computed:{lie:'ラフ（右）',remaining:25}};
 let view=ctx.gaCourseLandingResult(hole,pending);
 assert.match(flatten(view),/ラフ（右）/);
 assert.match(flatten(view),/着弾位置から自動判定/);
 pending.overrideLie='バンカー';
 view=ctx.gaCourseLandingResult(hole,pending);
 assert.match(flatten(view),/バンカー/);
 assert.match(flatten(view),/手動で修正/);
});
