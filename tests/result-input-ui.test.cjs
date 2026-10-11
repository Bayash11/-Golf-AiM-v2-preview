'use strict';
/* Test real result-entry renderers against UI and data consistency regressions. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extract(begin,end){
 const a=html.indexOf(begin),b=html.indexOf(end,a);
 assert.ok(a>=0&&b>a,'Missing boundaries: '+begin);
 return html.slice(a,b);
}
const impactCore=extract('const GA_IMPACT_OPTIONS=', 'function gaImpactText(');
const grids=extract('const gaImpactRows=[','/* refactor: removed shadowed Cp assignment #0 */');
const result=extract('/* Approved shot-result input redesign (2026-10-11). */',"const gaDailyAnalysisStyle=document.createElement('style');");
const AH=(tag,props,...children)=>({tag,props:props||{},children});
function find(root,match,out=[]){
 if(!root||typeof root!=='object')return out;
 if(match(root))out.push(root);
 for(const child of root.children||[])find(child,match,out);
 return out;
}
const named=(root,cls)=>find(root,x=>(x.props.className||'').split(' ').includes(cls));
function textOf(node){
 if(node==null)return '';
 if(typeof node==='string'||typeof node==='number')return String(node);
 if(Array.isArray(node))return node.map(textOf).join(' ');
 return (node.children||[]).map(textOf).join(' ');
}
function fixture({course=false,approach=false,pending={},good=['振り切れた','テンポが良かった'],miss=['力んだ','起き上がり'],shotIndex=0,totalShots=3}={}){
 const fields=[],positive=[],negative=[],saves=[],back=[],curveState=[];
 const doc={createElement(){return{textContent:'',id:''}},head:{appendChild(){}}};
 const context=vm.createContext({
  AH,document:doc,console,
  P:{Fragment:'fragment',useState(v){return[v,x=>curveState.push(x)]}},
  gaFeedbackEnabled:kind=>kind==='good'?good:miss,
  gaRowsFromLabels:(labels)=>{let rows=[];for(let i=0;i<labels.length;i+=3)rows.push(labels.slice(i,i+3));return rows},
  gaCourseLandingResult:()=>AH('div',{className:'ga-course-result-preview'},'course landing map'),
  se:()=>140,
 });
 vm.runInContext('var Cp,pp;\n'+impactCore+'\n'+grids+'\n'+result,context);
 const t={
  club:'7I',targetDistance:145,forward:150,lateral:5,
  isApproach:approach,aimTarget:'グリーン中央',curveBase:'ストレート',
  style:'ノーマル',resultCurve:'ストレート',contactImpact:[],
  contactPositive:[],contactOther:[],computed:{lie:'FW',remaining:20},
  ...pending
 };
 const props={
  pending:t,target:{targetDistance:145},shotIndex,totalShots,
  onField:(name,value)=>fields.push([name,value]),
  onTogglePositive:x=>positive.push(x),
  onToggleOther:x=>negative.push(x),
  onConfirm:()=>saves.push('save'),
  onBackToAim:()=>back.push('back')
 };
 const hole={prevPos:{x:0,y:0},aimPoint:{x:1,y:1},strokes:1,penalty:0};
 const view=course?context.pp({...props,hole}):context.Cp(props);
 return{view,t,fields,positive,negative,saves,back,curveState,context,props,hole};
}
test('feel stays exclusive; horizontal and vertical impact can combine and re-tap clears',()=>{
 const {context}=fixture();
 const choose=vm.runInContext('gaResultChooseImpact',context);
 let chosen=choose([],'良い');
 assert.deepEqual(Array.from(chosen),['良い']);
 chosen=choose(chosen,'悪い');
 assert.deepEqual(Array.from(chosen),['悪い']);
 chosen=choose(chosen,'ヒール');
 assert.deepEqual(Array.from(chosen),['悪い','ヒール']);
 chosen=choose(chosen,'上目');
 assert.deepEqual(Array.from(chosen),['悪い','ヒール','上目']);
 chosen=choose(chosen,'上目');
 assert.deepEqual(Array.from(chosen),['悪い','ヒール']);
 chosen=choose(chosen,'ヒール');
 assert.deepEqual(Array.from(chosen),['悪い']);
 chosen=choose(chosen,'悪い');
 assert.deepEqual(Array.from(chosen),[]);
});
test('all four diagonal face combinations are valid and order-independent',()=>{
 const choose=vm.runInContext('gaResultChooseImpact',fixture().context);
 for(const horizontal of ['ヒール','トゥ']){
  for(const vertical of ['上目','下目']){
   const first=choose(choose(['普通'],horizontal),vertical);
   const reverse=choose(choose(['普通'],vertical),horizontal);
   assert.deepEqual(Array.from(first),['普通',horizontal,vertical]);
   assert.deepEqual(Array.from(reverse),['普通',horizontal,vertical]);
  }
 }
});
test('opposite sides never coexist, and center remains standalone',()=>{
 const choose=vm.runInContext('gaResultChooseImpact',fixture().context);
 let selected=choose(['良い','ヒール','下目'],'トゥ');
 assert.deepEqual(Array.from(selected),['良い','トゥ','下目']);
 selected=choose(selected,'上目');
 assert.deepEqual(Array.from(selected),['良い','トゥ','上目']);
 selected=choose(selected,'真ん中');
 assert.deepEqual(Array.from(selected),['良い','真ん中']);
 selected=choose(selected,'下目');
 assert.deepEqual(Array.from(selected),['良い','下目']);
 selected=choose(selected,'真ん中');
 assert.deepEqual(Array.from(selected),['良い','真ん中']);
 selected=choose(selected,'真ん中');
 assert.deepEqual(Array.from(selected),['良い']);
});
test('legacy contradictory impact choices are normalized only on user edit',()=>{
 const ctx=fixture().context;
 const choose=vm.runInContext('gaResultChooseImpact',ctx);
 const normalize=vm.runInContext('gaResultNormalizeImpact',ctx);
 const input=['良い','悪い','ヒール','トゥ','下目','上目','真ん中'];
 assert.deepEqual(Array.from(normalize(input)),['良い','ヒール','下目']);
 assert.deepEqual(Array.from(choose(input,'普通')),['普通','ヒール','下目']);
 assert.deepEqual(Array.from(choose(input,'真ん中')),['良い','真ん中']);
 assert.deepEqual(Array.from(input),['良い','悪い','ヒール','トゥ','下目','上目','真ん中']);
});
test('both result modes show two selected points and footer uses combined names',()=>{
 for(const course of [false,true]){
  const f=fixture({course,pending:{contactImpact:['普通','ヒール','下目']}});
  const face=named(f.view,'ga-result-face-grid')[0];
  const selected=face.children.filter(x=>x.tag==='button'&&x.props['aria-pressed']);
  assert.deepEqual(selected.map(x=>textOf(x)),['ヒール','下目']);
  assert.match(textOf(named(f.view,'ga-result-face-note')[0]),/ヒール＋下目を選択中/);
  assert.match(textOf(named(f.view,'ga-result-footer-summary')[0]),/打感：普通.*打点：ヒール＋下目/);
  const heel=face.children.find(x=>x.tag==='button'&&textOf(x)==='ヒール');
  heel.props.onClick();
  assert.deepEqual([f.fields.at(-1)[0],Array.from(f.fields.at(-1)[1])],['contactImpact',['普通','下目']]);
  const center=face.children.find(x=>x.tag==='button'&&textOf(x)==='真ん中');
  center.props.onClick();
  assert.deepEqual([f.fields.at(-1)[0],Array.from(f.fields.at(-1)[1])],['contactImpact',['普通','真ん中']]);
 }
});
test('invalid prior combinations are normalized when any feel or point is changed',()=>{
 const choose=vm.runInContext('gaResultChooseImpact',fixture().context);
 const legacy=['良い','普通','悪い','ヒール','トゥ'];
 assert.deepEqual(Array.from(choose(legacy,'真ん中')),['良い','真ん中']);
 assert.deepEqual(Array.from(choose(legacy,'普通')),['普通','ヒール']);
});
test('random screen renders clear split groups with five-position face map',()=>{
 const {view,fields}=fixture({pending:{contactImpact:['普通','真ん中']}});
 const editor=named(view,'ga-result-impact-card')[0];
 assert.ok(editor);
 const feel=named(editor,'ga-result-feel-grid')[0].children;
 const face=named(editor,'ga-result-face-grid')[0].children;
 assert.deepEqual(feel.map(x=>textOf(x)),['良い','普通','悪い']);
 assert.equal(feel.filter(x=>x.props['aria-pressed']).length,1);
 assert.equal(face.filter(x=>x.tag==='button').length,5);
 assert.equal(face.filter(x=>x.tag==='span').length,4);
 assert.equal(face.filter(x=>x.tag==='button'&&x.props['aria-pressed']).length,1);
 feel[2].props.onClick();
 assert.deepEqual(fields.map(x=>[x[0],Array.from(x[1])]),[['contactImpact',['悪い','真ん中']]]);
 face.find(x=>x.tag==='button'&&textOf(x)==='上目').props.onClick();
 assert.deepEqual(Array.from(fields.at(-1)[1]),['普通','上目']);
});
test('course mode uses the same exclusive impact editor and preserves landing results',()=>{
 const {view,fields,saves}=fixture({course:true,pending:{contactImpact:['良い','ヒール']}});
 assert.equal(named(view,'ga-result-impact-card').length,1);
 assert.equal(named(view,'ga-course-result-preview').length,1);
 named(view,'ga-result-face-grid')[0].children.find(x=>x.tag==='button'&&textOf(x)==='トゥ').props.onClick();
 assert.deepEqual([fields.at(-1)[0],Array.from(fields.at(-1)[1])],['contactImpact',['良い','トゥ']]);
 named(view,'ga-result-record')[0].props.onClick();
 assert.deepEqual(saves,['save']);
});
test('horizontal miss buttons keep step size and have zero-reset action',()=>{
 const {view,fields}=fixture();
 const buttons=named(view,'ga-result-direction')[0].children;
 assert.equal(buttons.length,3);
 assert.equal(textOf(buttons[1]),'中央に戻す');
 buttons[0].props.onClick();buttons[1].props.onClick();buttons[2].props.onClick();
 assert.deepEqual(fields,[['lateral',0],['lateral',0],['lateral',10]]);
 const app=fixture({approach:true});
 const appButtons=named(app.view,'ga-result-direction')[0].children;
 appButtons[0].props.onClick();
 assert.deepEqual(app.fields,[['lateral',4]]);
});
test('distance ten presets, plus/minus adjustments and approach precision persist',()=>{
 const {view,fields}=fixture();
 assert.equal(named(view,'ga-result-distance-grid')[0].children.length,10);
 named(view,'ga-result-distance-grid')[0].children[1].props.onClick();
 const buttons=named(view,'ga-result-adjust')[0].children;
 buttons[0].props.onClick();buttons[1].props.onClick();
 assert.deepEqual(fields,[['forward',110],['forward',145],['forward',155]]);
 const approach=fixture({approach:true});
 assert.match(textOf(approach.view),/アプローチ時は ±1ydで調整/);
 named(approach.view,'ga-result-adjust')[0].children[0].props.onClick();
 assert.deepEqual(approach.fields,[['forward',149]]);
});
test('common curves visible by default, extra curves collapsible and editable',()=>{
 const f=fixture();
 assert.equal(named(f.view,'ga-result-curves').length,1);
 assert.equal(named(f.view,'ga-result-curves')[0].children[0].children.length,3);
 assert.equal(named(f.view,'ga-result-curve-extra').length,0);
 const more=named(f.view,'ga-result-curve-more')[0];
 assert.equal(more.props['aria-expanded'],false);
 more.props.onClick();
 assert.deepEqual(f.curveState,[true]);
 const expanded=fixture({pending:{resultCurve:'スライス'}});
 assert.equal(named(expanded.view,'ga-result-curve-extra').length,1);
 const choices=find(named(expanded.view,'ga-result-curve-extra')[0],x=>x.tag==='button');
 assert.ok(choices.some(x=>textOf(x)==='スライス'&&x.props['aria-pressed']));
 choices.find(x=>textOf(x)==='フック').props.onClick();
 assert.deepEqual(expanded.fields,[['resultCurve','フック']]);
 assert.equal(named(fixture({approach:true}).view,'ga-result-curves').length,0);
});
test('Good and Miss keep multiple-selection callbacks and custom enabled settings',()=>{
 const f=fixture({good:['振り切れた','独自Good'],miss:['力んだ','独自ミス']});
 const good=named(f.view,'ga-result-good')[0];
 const miss=named(f.view,'ga-result-miss')[0];
 assert.match(textOf(good),/独自Good/);
 assert.match(textOf(miss),/独自ミス/);
 find(good,x=>x.tag==='button').at(-1).props.onClick();
 find(miss,x=>x.tag==='button').at(-1).props.onClick();
 assert.deepEqual(f.positive,['独自Good']);
 assert.deepEqual(f.negative,['独自ミス']);
});
test('sticky footer, safe-area padding, and existing save and back callbacks are preserved',()=>{
 const f=fixture();
 assert.equal(named(f.view,'ga-result-footer').length,1);
 named(f.view,'ga-result-record')[0].props.onClick();
 named(f.view,'ga-random-result-back')[0].props.onClick();
 assert.deepEqual(f.saves,['save']);
 assert.deepEqual(f.back,['back']);
 assert.match(html,/ga-result-footer\{position:fixed/);
 assert.match(html,/env\(safe-area-inset-bottom,0px\)/);
 assert.match(html,/id='ga-result-redesign-20261011'/);
});
test('course penalty action and no changes to stored field names',()=>{
 const f=fixture({course:true,pending:{overrideLie:'OB'}});
 assert.match(textOf(named(f.view,'ga-result-record')[0]),/記録して4打目へ/);
 assert.equal(named(f.view,'ga-course-penalty').length,1);
 const source=extract('/* Approved shot-result input redesign (2026-10-11). */',"const gaDailyAnalysisStyle=document.createElement('style');");
 for(const x of ["'contactImpact'","'forward'","'lateral'","'resultCurve'"])assert.ok(source.includes(x));
});
