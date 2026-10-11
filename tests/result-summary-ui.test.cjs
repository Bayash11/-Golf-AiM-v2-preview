'use strict';
/* Run actual GOLF AiM summary renderers with minimal React/DOM fixtures. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extract(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a);
 assert.ok(a>=0&&b>a,'Source block missing: '+start);
 return html.slice(a,b);
}
const impact=extract('const GA_IMPACT_OPTIONS=', 'ra=function(t)');
const progress=extract('function gaShotEntryProgress(mode,count){','/* Approved result-summary redesign: use the same safe-area header as input screens. */');
const shared=extract('/* Approved result-summary redesign: use the same safe-area header as input screens. */','/* Approved shot-result input redesign (2026-10-11). */');
const random=extract('function gaTopValue(items','/* =========================================================\n   GOLF AiM v2 — STEP7');
const course=extract('xp=function({round:','/* =========================================================\n   GOLF AiM v2 — STEP13');
const AH=(tag,props,...children)=>({tag,props:props||{},children});
function all(root,match,acc=[]){
 if(!root||typeof root!=='object')return acc;
 if(match(root))acc.push(root);
 for(const child of root.children||[])all(child,match,acc);
 return acc;
}
const named=(root,cls)=>all(root,x=>(x.props.className||'').split(' ').includes(cls));
function textOf(root){
 if(root==null)return '';
 if(typeof root==='number'||typeof root==='string')return String(root);
 if(Array.isArray(root))return root.map(textOf).join(' ');
 return (root.children||[]).map(textOf).join(' ');
}
const shots=[
 {num:1,club:'7I',targetDistance:145,forward:148,lateral:4,
  distanceError:3,lateralError:4,distanceTolerance:12,lateralTolerance:14,
  success:true,resultSuccess:true,resultCurve:'フェード',style:'ノーマル',
  contactImpact:['普通','ヒール','下目'],contactOther:[]},
 {num:2,club:'Dr',targetDistance:220,forward:232,lateral:-18,
  distanceError:12,lateralError:18,distanceTolerance:18,lateralTolerance:16,
  success:false,resultSuccess:false,resultCurve:'スライス',style:'フルスイング',
  contactImpact:['悪い','トゥ','上目'],contactOther:['力んだ']},
 {num:3,club:'52°',targetDistance:65,forward:66,lateral:3,
  distanceError:1,lateralError:3,distanceTolerance:8,lateralTolerance:10,
  success:true,resultSuccess:true,resultCurve:'フェード',style:'ノーマル',
  contactImpact:['普通','ヒール','下目'],contactOther:[]}
];
function fixture(){
 const events=[],dom={createElement(){return {textContent:'',id:''}},head:{appendChild(){}}};
 const context=vm.createContext({
  AH,document:dom,console,window:{},
  P:{useState(initial){return [typeof initial==='function'?initial():initial,(update)=>events.push(['state',update])]},
     useEffect(){},Fragment:'fragment'},
  GaBottomNav:()=>null,
  Lg:async()=>true,my:x=>JSON.stringify(x),
  Sf:()=>({distanceTolerance:15,lateralTolerance:15}),
  _gaCurrentResult:()=>({score:78,legacy:{shotAccuracy:{score:72},management:{score:79}},
    metrics:{penaltyCount:1,bigMissCount:1,shots:9,bigMissRate:11.1,approachMedianM:3.5,medianRatio:0.82}}),
  _gaRecentAssessment:()=>({status:'確定',sessionsUsed:5,shotLevel:'90切り',managementLevel:'90切り',approachLevel:'90切り',overallLevel:'90切り',metrics:{bigMissRate:15}}),
  _gaLevelText:x=>x,_gaPct:x=>x,
  ra:s=>s.contactOther||[],sp:r=>JSON.stringify(r),
  sn:()=>null
 });
 vm.runInContext('var Dp,xp;\n'+impact+'\n'+progress+'\n'+shared+'\n'+random+'\n'+course,context);
 const props={
  session:{shots,success:2,totalShots:3,avgDistanceError:5.3,avgLateralError:8.3},
  onMenu:()=>events.push('menu'),onRestart:()=>events.push('restart'),
  onData:()=>events.push('data'),onHome:()=>events.push('home'),
  onPractice:()=>events.push('practice'),onSettings:()=>events.push('settings')
 };
 const round={holeCount:3,holes:[
  {number:1,par:4,total:5,gir:false,shots:[{club:'7I',contactOther:['力んだ']}]},
  {number:2,par:3,total:3,gir:true,shots:[{club:'8I',contactOther:[]}]},
  {number:3,par:5,total:5,gir:true,shots:[{club:'7I',contactOther:[]}]}]};
 return {context,events,props,round,random:(overrides={})=>context.Dp({...props,...overrides}),
  course:(overrides={})=>context.xp({round,skillLevel:'break90',history:[],...props,...overrides})};
}
test('both summary modes share balanced 3-column safe-area header and safe back',()=>{
 const f=fixture();
 for(const [screen,title,mode,count] of [[f.random(),'ランダム結果','ランダム練習','3球 完了'],
                                      [f.course(),'コース結果','コース想定','3H 完了']]){
  const headers=named(screen,'ga-final-summary-head');
  assert.equal(headers.length,1);
  const header=headers[0];
  assert.equal(header.children.length,3);
  assert.equal(textOf(header.children[1]),title);
  assert.equal(textOf(header.children[2]),'GOLF AiM');
  assert.equal(header.children[2].tag,'div','Brand must never trigger navigation');
  assert.equal(textOf(header.children[0]),'‹ 戻る');
  header.children[0].props.onClick();
  assert.equal(f.events.at(-1),'menu');
  const progressItems=named(screen,'ga-final-progress-wrap');
  assert.equal(progressItems.length,1);
  assert.match(textOf(progressItems[0]),new RegExp(mode));
  assert.match(textOf(progressItems[0]),new RegExp(count));
 }
 assert.match(html,/id='ga-final-summary-20261011'/);
 assert.ok(html.includes('grid-template-columns:84px minmax(0,1fr) 84px'));
});
test('success card retains real saved values and two accuracy metrics',()=>{
 const f=fixture();const view=f.random();
 const hero=named(view,'ga-final-hero')[0];assert.ok(hero);
 assert.match(textOf(hero),/2\s*\/ 3/);
 assert.match(textOf(hero),/成功率 67%/);
 assert.match(textOf(hero),/平均距離誤差/);
 assert.match(textOf(hero),/5.3/);
 assert.match(textOf(hero),/平均横ズレ/);
 assert.match(textOf(hero),/8.3/);
 assert.equal(named(hero,'ga-random-result-cell').length,2);
 assert.equal(named(hero,'ga-final-hero-bar')[0].props['aria-valuenow'],67);
});
test('result evaluation is preserved, with explanations collapsed by default',()=>{
 const f=fixture();
 const rand=f.random(),course=f.course();
 assert.equal(named(rand,'ga-random-eval-card').length,3);
 assert.equal(named(course,'ga-course-eval').length,3);
 const explain=all(rand,x=>x.tag==='details'&&(x.props.className||'').includes('ga-final-explain'));
 assert.equal(explain.length,1);
 assert.match(textOf(explain[0]),/総合評価は成功率50%＋精度50%/);
 assert.equal(explain[0].props.open,undefined,'Native details starts collapsed');
 assert.equal(named(course,'ga-final-explain').length,1);
 assert.match(textOf(course),/マネジメント/);
});
test('short shot list displays blue success and orange failure badges with distance details',()=>{
 const f=fixture(),root=f.random();
 const rows=named(root,'ga-random-preview-row');
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(x=>textOf(named(x,'mark')[0])),['成功','失敗','成功']);
 assert.match(textOf(rows[0]),/145yd → 148yd \/ 右4yd/);
 assert.match(textOf(rows[1]),/220yd → 232yd \/ 左18yd/);
 assert.equal(named(rows[0],'mark')[0].props.className,'mark ');
 assert.equal(named(rows[1],'mark')[0].props.className,'mark ng');
 assert.match(html,/#EEF4FF/);assert.match(html,/#2F6FE4/);
 assert.match(html,/#FFF1E9/);assert.match(html,/#D96A33/);
 assert.match(html,/\.ga-random-history-shot-mark\.ng/);
});
test('expanded shot list remains accessible and uses same status texts',()=>{
 const f=fixture(),root=f.random({session:{...f.props.session,totalShots:10}});
 const toggle=named(root,'ga-random-all-toggle')[0];
 assert.match(textOf(toggle),/全ショットを確認する/);
 toggle.props.onClick();
 const update=f.events.find(x=>Array.isArray(x)&&x[0]==='state');
 assert.equal(typeof update[1],'function');
 assert.equal(update[1](false),true);
 const full=f.random({session:{...f.props.session,shots:[...shots],totalShots:3}});
 assert.equal(named(full,'ga-random-preview-row').length,3,'Before toggle original 3 entries remain');
 const source=extract('Dp=function({session','/* =========================================================\n   GOLF AiM v2 — STEP7');
 assert.match(source,/ga-random-shot-card/);
 assert.match(source,/gaRandomImpactLabel\(x\)/);
});
test('new combined impact strings aggregate reliably and preserve legacy shots',()=>{
 const f=fixture(),fn=vm.runInContext('gaRandomImpactLabel',f.context),top=vm.runInContext('gaRandomTopPair',f.context);
 assert.equal(fn(shots[0]),'普通・ヒール＋下目');
 assert.equal(fn(shots[1]),'悪い・トゥ＋上目');
 assert.equal(top(shots),'普通・ヒール＋下目');
 const legacy={contactVertical:'良い当たり',contactHorizontal:'センター'};
 assert.equal(fn(legacy),'良い・真ん中');
 assert.equal(fn({contactVertical:'下目',contactHorizontal:'ヒール'}),'ヒール＋下目');
 assert.equal(fn({contactImpact:[]}), '—');
 const view=f.random();assert.match(textOf(view),/普通・ヒール＋下目 2\/3/);
 assert.deepEqual(shots[0].contactImpact,['普通','ヒール','下目'],'Stored records not mutated');
});
test('course score/GIR/penalty/hole results and current level remain intact',()=>{
 const f=fixture();const view=f.course();
 assert.match(textOf(view),/3ホールのトータルスコア/);
 assert.match(textOf(view),/13/);
 assert.match(textOf(view),/PAR 12/);
 assert.equal(named(view,'ga-course-hole-result').length,3);
 assert.match(textOf(view),/現在の実力/);
 assert.match(textOf(view),/ショット再現性/);
 const buttons=named(view,'ga-course-final-actions')[0];
 assert.equal(buttons.children.length,3);
 buttons.children[0].props.onClick();
 assert.equal(f.events.at(-1),'restart');
});
test('old persistence and navigation actions remain and no new storage fields added',()=>{
 const f=fixture();const rand=f.random();const controls=named(rand,'ga-random-summary-actions')[0];
 const buttons=controls.children;
 assert.equal(buttons.length,3);
 buttons[0].props.onClick();buttons[1].props.onClick();
 assert.deepEqual(f.events.slice(-2),['restart','data']);
 assert.match(textOf(buttons[2]),/JSONデータをコピー/);
 const code=extract('Dp=function({session','/* =========================================================\n   GOLF AiM v2 — STEP7');
 assert.match(code,/copyJson/);
 assert.match(code,/GaBottomNav/);
 assert.match(code,/gaRandomToleranceScore/);
});
test('HTML inline scripts still parse after summary changes',()=>{
 let count=0;
 for(const hit of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
  if(/type\s*=\s*["']application\/json/i.test(hit[1]))continue;
  if(!hit[2].trim())continue;
  assert.doesNotThrow(()=>new vm.Script(hit[2]));
  count++;
 }
 assert.ok(count>=1);
});

test('multi-axis strike entries count individually; legacy empty arrays still resolve',()=>{
 const f=fixture();
 const frequency=vm.runInContext('gaSummaryImpactCounts',f.context);
 const normalized=vm.runInContext('gaImpactSelections',f.context);
 const result=frequency(shots);
 const count=(rows,label)=>rows.find(row=>row.label===label)?.count||0;
 assert.equal(count(result.feel,'普通'),2);
 assert.equal(count(result.feel,'悪い'),1);
 assert.equal(count(result.points,'ヒール'),2);
 assert.equal(count(result.points,'下目'),2);
 assert.equal(count(result.points,'トゥ'),1);
 assert.equal(count(result.points,'上目'),1);
 assert.equal(count(result.points,'真ん中'),0);
 const legacy={contactImpact:[],contactVertical:'下目',contactHorizontal:'ヒール'};
 assert.deepEqual(Array.from(normalized(legacy)),['下目','ヒール']);
 const mixed=frequency([...shots,legacy]);
 assert.equal(count(mixed.points,'ヒール'),3);
 assert.equal(count(mixed.points,'下目'),3);
 assert.deepEqual(shots[0].contactImpact,['普通','ヒール','下目'],'Summary never mutates stored arrays');
});
test('random result includes Good, miss, separate face-feel counts and original combination',()=>{
 const f=fixture(),view=f.random();
 assert.match(textOf(view),/今回の傾向/);
 assert.match(textOf(view),/Good/);
 assert.equal(named(view,'ga-summary-impact-panel').length,1);
 assert.match(textOf(view),/普通 2回/);
 assert.match(textOf(view),/ヒール 2回/);
 assert.match(textOf(view),/下目 2回/);
 assert.match(textOf(view),/最多の組み合わせ：普通・ヒール＋下目 2\/3/);
});
test('course result shows swing trends and separates session score from historical ability',()=>{
 const f=fixture();
 const round={...f.round,holes:f.round.holes.map((h,i)=>({
  ...h,shots:[{club:'7I',contactImpact:['良い','ヒール','下目'],
   contactPositive:['テンポが良かった'],contactOther:[],style:'ライン出し',resultCurve:'フェード'}]
 }))};
 const view=f.course({round});
 assert.match(textOf(view),/今回の評価（このラウンドのみ）/);
 assert.match(textOf(view),/総合点はスコア35%/);
 assert.match(textOf(view),/ショット傾向・振り返り/);
 assert.match(textOf(view),/テンポが良かった/);
 assert.match(textOf(view),/ヒール 3回/);
 assert.match(textOf(view),/下目 3回/);
 assert.match(textOf(view),/現在の実力（履歴ベース）/);
 assert.match(textOf(view),/最大5回の完了履歴/);
 assert.equal(named(view,'ga-course-hole-result').length,3);
});
test('success and failure status tags use compact unshadowed blue/orange pills',()=>{
 assert.match(html,/min-width:49px;min-height:28px;padding:5px 8px;border:0;border-radius:999px/);
 assert.match(html,/background:#EEF4FF;color:#2F6FE4/);
 assert.match(html,/background:#FFF1E9;color:#D96A33/);
});
