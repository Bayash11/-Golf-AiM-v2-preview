'use strict';
/* Regression checks for random shot aiming UI and generated course data. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const begin="zp=function({target,shotIndex,totalShots=10,fixedClub=null,selectedClub,onClub,clubs,isApproach,plan,onPlanField,onStartShot}){";
const end="/* Course aim uses the same enabled shot-style list.";
const first=html.indexOf(begin),last=html.indexOf(end,first);
assert.ok(first>=0&&last>first,'random aim code must exist');
const code=html.slice(first,last);
const AH=(tag,props,...children)=>({tag,props:props||{},children});
function collect(node,match,result=[]){
 if(!node||typeof node!=='object')return result;
 if(match(node))result.push(node);
 for(const child of node.children||[])collect(child,match,result);
 return result;
}
function named(node,cls){
 return collect(node,x=>(x.props.className||'').split(' ').includes(cls));
}
function flattenText(node){
 if(node==null)return '';
 if(typeof node==='string'||typeof node==='number')return String(node);
 if(Array.isArray(node))return node.map(flattenText).join(' ');
 if(typeof node==='object')return (node.children||[]).map(flattenText).join(' ');
 return '';
}
const courseData=[
 {label:'グリーンサイズ',value:'奥行25yd × 幅24yd'},
 {label:'ピン位置',value:'中央'},
 {label:'OB（右）',value:'中心から25yd',warn:true},
 {label:'池（グリーン手前）',value:'手前まで110yd／越えるには125yd',warn:true},
 {label:'バンカー（グリーン左）',value:'143yd先'},
 {label:'木（右）',value:'枝が張り出し'}
];
function fixture({green=true,fixedClub=null,selectedClub='7I',courseInfo=courseData}={}){
 const changes=[],picked=[],hits=[];
 const ctx=vm.createContext({
  AH,gaUseResetViewportOnMount:()=>{},
  gaShotStyleEnabled:()=>['ノーマル','ライン出し','フルスイング'],
  gaAimChoices:(items,value,change,cols)=>AH('div',{className:'ga-random-choice '+cols},...items.map(x=>AH('button',{type:'button','aria-pressed':value===x.value,onClick:()=>change(x.value)},x.label)))
 });
 vm.runInContext('var zp;\n'+code,ctx);
 const target={targetDistance:green?145:220,isGreenShot:green,courseInfo};
 const plan={aimTarget:green?'グリーン中央':'フェアウェイセンター',curveBase:'ストレート',style:'ノーマル'};
 const view=ctx.zp({target,shotIndex:0,totalShots:10,fixedClub,selectedClub,
  clubs:['Dr','7I','8I'],plan,
  onClub:x=>picked.push(x),onPlanField:(field,value)=>changes.push([field,value]),
  onStartShot:()=>hits.push('shot')});
 return {view,changes,picked,hits};
}
test('shot-specific green size, pin and all OB/water/bunker/tree records survive',()=>{
 const {view}=fixture();
 const course=named(view,'ga-random-course-info')[0];
 assert.ok(course,'course information card exists');
 const metrics=named(course,'ga-random-course-metric');
 assert.equal(metrics.length,2);
 assert.match(flattenText(metrics[0]),/奥行25yd × 幅24yd/);
 assert.match(flattenText(metrics[1]),/ピン位置 中央/);
 const hazards=named(course,'ga-random-course-hazard');
 assert.equal(hazards.length,4);
 assert.match(flattenText(course),/OB（右）/);
 assert.match(flattenText(course),/中心から25yd/);
 assert.match(flattenText(course),/池（グリーン手前）/);
 assert.match(flattenText(course),/手前まで110yd／越えるには125yd/);
 assert.match(flattenText(course),/バンカー（グリーン左）/);
 assert.match(flattenText(course),/木（右）/);
 assert.equal(named(view,'ga-random-aim-target').length,1);
 assert.match(flattenText(view),/145 yd/);
});
test('normal-shot fairway width and differing warnings use incoming data',()=>{
 const info=[{label:'フェアウェイ幅',value:'32yd'},{label:'OB（左）',value:'中心から18yd',warn:true}];
 const {view}=fixture({green:false,courseInfo:info});
 const course=named(view,'ga-random-course-info')[0];
 assert.match(flattenText(course),/フェアウェイ幅 32yd/);
 assert.match(flattenText(course),/OB（左） 中心から18yd/);
 assert.doesNotMatch(flattenText(course),/ピン位置|グリーンサイズ/);
 assert.match(flattenText(view),/220 yd/);
 assert.equal(named(view,'ga-random-direction-grid')[0].children.length,3);
});
test('nine-position green aim preserves stored aim values and updates callback',()=>{
 const {view,changes}=fixture();
 const options=named(view,'ga-random-direction-grid')[0].children;
 assert.equal(options.length,9);
 assert.equal(options[4].props['aria-pressed'],true);
 assert.equal(flattenText(options[0]),'↖ 左奥');
 options[0].props.onClick();
 options[8].props.onClick();
 assert.deepEqual(changes,[['aimTarget','グリーン左奥'],['aimTarget','グリーン右手前']]);
});
test('fairway aim offers left center right without changing original data values',()=>{
 const {view,changes}=fixture({green:false});
 const options=named(view,'ga-random-direction-grid')[0].children;
 assert.deepEqual(options.map(flattenText),['← 左','● 中央','→ 右']);
 options[1].props.onClick();
 assert.deepEqual(changes,[['aimTarget','フェアウェイセンター']]);
});
test('registered clubs, curve, styles and hit callback remain working',()=>{
 const {view,changes,picked,hits}=fixture();
 const clubs=named(view,'ga-random-aim-clubs')[0].children;
 clubs[0].props.onClick();
 assert.deepEqual(picked,['Dr']);
 const curve=named(view,'ga-random-choice')[0].children;
 curve[2].props.onClick();
 const styles=named(view,'ga-random-choice')[1].children;
 styles[1].props.onClick();
 assert.deepEqual(changes,[['curveBase','フェード'],['style','ライン出し']]);
 const btn=named(view,'ga-random-hit')[0];
 assert.equal(btn.props.disabled,false);
 btn.props.onClick();
 assert.deepEqual(hits,['shot']);
});
test('fixed-club view and missing-club protection are unchanged',()=>{
 const fixed=fixture({fixedClub:'7I'});
 assert.equal(named(fixed.view,'ga-random-aim-clubs').length,0);
 assert.match(flattenText(named(fixed.view,'ga-random-club-display')[0]),/7I/);
 assert.equal(named(fixed.view,'ga-random-hit')[0].props.disabled,false);
 const unselected=fixture({fixedClub:null,selectedClub:null});
 assert.equal(named(unselected.view,'ga-random-hit')[0].props.disabled,true);
});
test('fixed call-to-action and safe areas are present in the refined style',()=>{
 assert.match(html,/id='ga-random-aim-refined-style'/);
 assert.match(html,/ga-random-aim-footer\{position:fixed/);
 assert.match(html,/env\(safe-area-inset-bottom,0px\)/);
 assert.match(code,/onClick:onStartShot/);
 assert.match(code,/courseInfo\|\|\[\]/);
});
