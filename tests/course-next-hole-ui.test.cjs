'use strict';
/* GOLF AiM STEP04: next-shot summary and finish screen contract tests. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extract(a,b){
 const x=html.indexOf(a),y=html.indexOf(b,x);
 assert.ok(x>=0&&y>x,'missing source range '+a);
 return html.slice(x,y);
}
const nextShotSource=extract('dp=function(props){','yp=function({selectedClub,onClub,clubs}){');
const finishSource=extract('bp=function({current,isLastHole,onNext,completedHoles=[]}){','/* =========================================================\n   GOLF AiM v2 — STEP12');
const cssSource=extract("const gaCourseStep04Style=document.createElement('style');","bp=function({current,isLastHole,onNext,completedHoles=[]}){");
const AH=(tag,props,...children)=>({tag,props:props||{},children});
function collect(root,match,out=[]){
 if(!root||typeof root!=='object')return out;
 if(match(root))out.push(root);
 for(const x of root.children||[])collect(x,match,out);
 return out;
}
const named=(root,cls)=>collect(root,x=>((x.props||{}).className||'').split(' ').includes(cls));
function textOf(node){
 if(node==null)return '';
 if(typeof node==='string'||typeof node==='number')return String(node);
 if(Array.isArray(node))return node.map(textOf).join('');
 return (node.children||[]).map(textOf).join('');
}
function fixture(){
 const hooks=[],callbacks={index:0},reported=[];
 const P={
  Fragment:'fragment',
  useState(value){
   const i=callbacks.index++;
   if(!hooks[i])hooks[i]={value};
   return [hooks[i].value,next=>{hooks[i].value=typeof next==='function'?next(hooks[i].value):next}];
  },
  useRef(value){
   const i=callbacks.index++;
   if(!hooks[i])hooks[i]={current:value};
   return hooks[i];
  },
  useEffect(){}
 };
 const doc={createElement(){return {id:'',textContent:''}},head:{appendChild(style){reported.push(style)}}};
 const ctx=vm.createContext({AH,P,document:doc,AimMap:'aim-map',aimScoreText:d=>d===0?'E':d>0?'+'+d:String(d),console:{error:x=>reported.push(['error',x])}});
 vm.runInContext('var dp,bp;\n'+nextShotSource+'\n'+cssSource+'\n'+finishSource,ctx);
 return{ctx,reported,renderBp:props=>{callbacks.index=0;return ctx.bp(props)},renderDp:props=>{callbacks.index=0;return ctx.dp(props)}};
}
const hole={number:2,par:5,distance:510,pinLabel:'中央',green:{halfWidth:14,depth:15},strokes:1,penalty:0,lie:'ラフ（右）',remaining:285};
const prev={num:1,club:'Dr',forward:225,lie:'ラフ（右）',remaining:285,penalty:false};
test('next-shot screen shows preceding club, distance and actual lie, without altering current-shot strip',()=>{
 const f=fixture(),view=f.renderDp({hole,shots:[prev],prevPos:{x:0,y:225},tapEnabled:true});
 const reminder=named(view,'ga-course-last-shot');
 assert.equal(reminder.length,1);
 assert.match(textOf(reminder[0]),/直前のショット/);
 assert.match(textOf(reminder[0]),/Dr ・ 225yd/);
 assert.match(textOf(reminder[0]),/ラフ（右）/);
 assert.match(textOf(named(view,'ga-course-shot-strip')[0]),/2打目・ラフ（右）/);
 assert.match(textOf(named(view,'ga-course-shot-strip')[0]),/285yd/);
 assert.equal(collect(view,x=>x.tag==='aim-map').length,1);
});
test('no fake previous shot is shown at the tee; result-entry hides stale reminder',()=>{
 const f=fixture();
 const tee=f.renderDp({hole:{...hole,strokes:0,remaining:510},shots:[],tapEnabled:true});
 assert.equal(named(tee,'ga-course-last-shot').length,0);
 const results=f.renderDp({hole,shots:[prev],tapEnabled:false,pendingPoint:{x:5,y:400}});
 assert.equal(named(results,'ga-course-last-shot').length,0);
});
test('OB and pond are clearly marked as penalties without inventing a new score',()=>{
 const f=fixture();
 for(const lie of ['OB','池']){
  const view=f.renderDp({hole:{...hole,strokes:1,penalty:1},shots:[{num:1,club:'7I',forward:140,lie,penalty:true}],tapEnabled:true});
  const card=named(view,'ga-course-last-shot')[0];
  assert.equal(named(card,'is-penalty').length,1);
  assert.match(textOf(card),/＋1罰打/);
  assert.match(textOf(card),new RegExp(lie));
 }
});
test('hole finish uses the existing rounded total and separates four score components',()=>{
 const f=fixture(),current={number:2,par:5,strokes:3,penalty:1,expectedPutts:1.67,remainingAtGreenM:4.3};
 const view=f.renderBp({current,isLastHole:false,onNext:()=>{},completedHoles:[{total:4,par:4}]});
 const header=named(view,'ga-course-hole-finish-head')[0];
 assert.equal(header.tag,'header');
 assert.equal(header.children.length,3);
 assert.equal(textOf(header.children[0]),'コース想定');
 assert.equal(textOf(header.children[1]),'ホール結果');
 assert.equal(textOf(header.children[2]),'GOLFAiM');
 assert.equal(named(view,'ga-hole-finish-metric').length,4);
 const metric=named(view,'ga-hole-finish-metric').map(textOf);
 assert.deepEqual(metric,['ショット数3打','ペナルティ1打','想定パット1.67打','グリーンオン残り4.3m']);
 assert.match(textOf(named(view,'ga-hole-finish-score')[0]),/6\+1/);
 assert.match(textOf(named(view,'ga-hole-finish-cumulative')[0]),/10打 \/ \+1/);
 assert.equal(named(view,'ga-hole-finish-metric penalty').length,0);
 assert.equal(named(view,'penalty').length,1);
 assert.match(textOf(named(view,'ga-hole-finish-next')[0]),/次のホールへ/);
});
test('single click guard prevents duplicate next-hole transitions even before React rerender',()=>{
 const f=fixture(),current={number:1,par:4,strokes:2,penalty:0,expectedPutts:2,remainingAtGreenM:7};
 let calls=0;
 const props={current,isLastHole:false,onNext:()=>{calls++;return new Promise(()=>{})},completedHoles:[]};
 let screen=f.renderBp(props);
 const btn=named(screen,'ga-hole-finish-next')[0];
 btn.props.onClick();
 btn.props.onClick();
 assert.equal(calls,1);
 screen=f.renderBp(props);
 const busy=named(screen,'ga-hole-finish-next')[0];
 assert.equal(busy.props.disabled,true);
 assert.equal(busy.props['aria-busy'],true);
 assert.match(textOf(busy),/記録を確定中/);
});
test('last hole navigates only by explicit completion and has no deceptive back button',()=>{
 const f=fixture();
 let count=0;const current={number:3,par:3,strokes:1,penalty:0,expectedPutts:2,remainingAtGreenM:10};
 const view=f.renderBp({current,isLastHole:true,onNext:()=>{count++;return Promise.resolve()},completedHoles:[{total:4,par:4},{total:5,par:5}]});
 assert.equal(named(view,'ga-hole-finish-progress').length,1);
 assert.match(textOf(named(view,'ga-hole-finish-progress')[0]),/最終ホール/);
 assert.equal(collect(view,n=>n.tag==='button').length,1);
 const btn=named(view,'ga-hole-finish-next')[0];
 assert.match(textOf(btn),/ラウンド結果を見る/);
 btn.props.onClick();
 assert.equal(count,1);
});
test('one design system used for phone safe header, orange next button, blue score',()=>{
 const f=fixture();
 const css=f.reported.find(x=>x.id==='ga-course-step04-20261011');
 assert.ok(css,'STEP04 style installed');
 assert.match(css.textContent,/grid-template-columns:84px minmax\(0,1fr\) 84px/);
 assert.match(css.textContent,/\.ga-hole-finish-head-brand span\{position:static!important/);
 assert.match(css.textContent,/\.ga-hole-finish-cumulative-row strong\{color:var\(--ga-blue\)/);
 assert.match(css.textContent,/\.ga-course-last-shot-lie.is-penalty\{background:#FFF1E9/);
 assert.match(css.textContent,/@media\(max-width:360px\)/);
 assert.match(css.textContent,/\.ga-hole-finish-next\{min-height:56px;border-radius:16px/);
});
test('score calculation, next-hole generator and storage are left untouched',()=>{
 assert.match(html,/let b=n.current,E=b.expectedPutts\?\?2,O=b.strokes\+b.penalty\+E,j=Math.round\(O\)/);
 assert.match(html,/await gaPersistSession\("course",Zt\[0\]\)/);
 assert.match(html,/if\(dt>=n.pars.length\)/);
 assert.match(html,/gaUseCourseTrainingScreenTop\(hole\)/);
});
