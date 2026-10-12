'use strict';
/* Shared optional strike evaluation: random/course; historical data and exports. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extract(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a);
 assert.ok(a>=0&&b>a,'Cannot find source block: '+start);
 return html.slice(a,b);
}
const source=extract('const GA_IMPACT_OPTIONS=','function gaDegradeResultTier(');
const randomExport=extract('function my(t){','function ip(t){');
const unified=extract('function fi(t,l){','function yy(t){');
const courseExport=extract('function sp(t){','function fp({icon:t}){');
function create(type,props,...children){return{type,props:props||{},children}}
function flatten(node){
 if(node==null)return '';
 if(typeof node==='number'||typeof node==='string')return String(node);
 if(Array.isArray(node))return node.map(flatten).join('');
 return (node.children||[]).map(flatten).join('');
}
function fixture(){
 const ctx=vm.createContext({
  AH:create,
  da:1,fn:x=>x<0?'左':'右',
  si:t=>t.contactPositive||[],
  console
 });
 vm.runInContext('var ra,yf;\n'+source+'\n'+randomExport+'\n'+unified+'\n'+courseExport,ctx);
 return ctx;
}
function shot(contactImpact,other={}){
 return {mode:'course',num:1,club:'7I',isApproach:false,curveBase:'ストレート',resultCurve:'ストレート',
  contactImpact,contactOther:[],contactPositive:[],resultTier:'perfect',resultSuccess:true,success:true,forward:150,lateral:0,lie:'フェアウェイ',
  remaining:25,penalty:false,before:{club:'7I',targetDistance:150},
  evaluation:{resultTier:'perfect',shotQualityTier:'minorMiss',
   shotQualityEvaluation:{tier:'minorMiss',strikeQuality:'fair'},strikeQuality:'fair'},
  ...other};
}
const sample=[
 shot(['良い','真ん中'],{num:1,club:'4U',resultCurve:''}),
 shot(['悪い','トゥ'],{num:1,club:'Dr',curveBase:'フェード',resultCurve:'フック',contactOther:['力んだ']}),
 shot([],{num:2,club:'5W',resultCurve:''}),
 shot(['良い','真ん中'],{num:3,club:'9I',curveBase:'フェード',resultCurve:'フェード'}),
 shot(['普通','真ん中'],{num:4,club:'52°',isApproach:true}),
 shot(['普通','真ん中'],{num:1,club:'Dr'}),
 shot([],{num:2,club:'Dr',resultCurve:''}),
 shot(['良い','真ん中'],{num:3,club:'48°',isApproach:true})
];
test('blank impact, Good-only and routine curves are NOT automatic minor misses',()=>{
 const c=fixture();
 for(const x of [
  shot([],{resultCurve:''}),shot([],{resultCurve:'ストレート'}),
  shot([],{resultCurve:'フェード',curveBase:'フェード'}),
  shot([],{contactPositive:['振り切れた'],resultCurve:''})
 ]){
  const q=c.gaShotQualityEvaluation(x);
  assert.equal(q.tier,'unrated');
  assert.equal(q.evaluated,false);
  assert.equal(q.strikeQuality,'unknown');
  assert.equal(q.clean,false);
  assert.equal(c.gaShotQualityLabel(q.tier),'未評価');
 }
});
test('explicit impact and miss evidence remains evaluable, with unchanged outcome grading',()=>{
 const c=fixture();
 assert.equal(c.gaShotQualityEvaluation(shot(['良い','真ん中'])).tier,'clean');
 assert.equal(c.gaShotQualityEvaluation(shot(['普通','真ん中'])).tier,'minorMiss');
 assert.equal(c.gaShotQualityEvaluation(shot(['悪い','トゥ'])).tier,'majorMiss');
 assert.equal(c.gaShotQualityEvaluation(shot([],{resultCurve:'',contactOther:['力んだ']})).tier,'minorMiss');
 assert.equal(c.gaShotQualityEvaluation(shot([],{resultCurve:'チョロ'})).tier,'majorMiss');
 assert.equal(c.gaShotQualityLabel('clean'),'Clean');
 assert.equal(c.gaShotQualityLabel('minorMiss'),'軽微なミス');
 assert.equal(c.gaShotQualityLabel('majorMiss'),'ミスあり');
});
test('older vertical/horizontal input remains evaluable despite contactImpact:[]',()=>{
 const c=fixture();
 const x=shot([],{contactVertical:'良い当たり',contactHorizontal:'センター',resultCurve:''});
 const q=c.gaShotQualityEvaluation(x);
 assert.equal(q.evaluated,true);
 assert.equal(q.tier,'clean');
 assert.deepEqual(Array.from(q.impact),['良い','真ん中']);
});
test('shared Clean rate for supplied 8-shot pattern is 3 of 6 = 50% (not 3/8)',()=>{
 const c=fixture();
 const input=structuredClone(sample);
 const q=c.gaCleanShotRate(input);
 assert.equal(q.cleanShots,3);
 assert.equal(q.evaluatedShots,6);
 assert.equal(q.unratedShots,2);
 assert.equal(q.totalShots,8);
 assert.equal(q.cleanShotRate,50);
 assert.deepEqual(input,sample,'data remains untouched');
});
test('100% blank quality records are unrated, not 0% Clean',()=>{
 const c=fixture(),data=[shot([],{resultCurve:''}),shot([],{resultCurve:''})];
 const q=c.gaCleanShotRate(data);
 assert.equal(q.cleanShotRate,null);
 assert.equal(q.cleanShots,0);
 assert.equal(q.evaluatedShots,0);
 assert.equal(q.unratedShots,2);
 const row=c.gaQualityCoverageRow(data);
 assert.equal(row.props.className,'ga-clean-quality-row');
 assert.match(flatten(row),/Clean率未評価/);
 assert.match(flatten(row),/評価済み 0\/2球/);
});
test('Clean coverage on screen spells out percent and denominator',()=>{
 const c=fixture(),row=c.gaQualityCoverageRow(sample);
 assert.match(flatten(row),/Clean率50%/);
 assert.match(flatten(row),/Clean 3\/6球/);
 assert.match(flatten(row),/評価済み 6\/8球/);
 assert.match(html,/gaQualityCoverageRow\(shots\)/);
 assert.match(html,/gaQualityCoverageRow\(courseShots\)/);
 assert.match(html,/\.ga-clean-quality-row/);
});
test('random JSON export recomputes historical quality, but does not mutate stored objects',()=>{
 const c=fixture(),shots=structuredClone(sample),original=structuredClone(shots);
 const session={sessionId:'unit-random',date:'2026/10/12',ballCount:8,totalShots:8,clubMode:'random',success:7,
  successRate:88,cleanShots:3,cleanShotRate:38,shots};
 const exported=c.my(session);
 assert.equal(exported.sessionSummary.cleanShots,3);
 assert.equal(exported.sessionSummary.evaluatedShots,6);
 assert.equal(exported.sessionSummary.unratedShots,2);
 assert.equal(exported.sessionSummary.cleanShotRate,50);
 assert.equal(exported.shots[2].shotQualityEvaluation.tier,'unrated');
 assert.equal(exported.shots[2].strikeQuality,'unknown');
 assert.equal(exported.shots[2].resultTier,'perfect');
 assert.deepEqual(shots,original);
 assert.equal(session.cleanShotRate,38,'persisted previous snapshot stays unchanged');
});
test('course JSON and unifiedShots re-evaluate old quality snapshots consistently',()=>{
 const c=fixture(),shots=structuredClone(sample),original=structuredClone(shots);
 const hole1={number:1,par:4,total:6,distance:350,pinLabel:'右',elevation:'flat',
  obFlag:false,waterFlag:false,holeExpectedScore:5.7,holeScoreToPar:1.7,expectedPutts:1.7,
  remainingAtGreenM:4.5,gir:false,shots};
 const exported=c.sp({date:'2026/10/12',sessionId:'unit-course',holeCount:1,holes:[hole1],totalScore:6,diff:2});
 assert.equal(exported.cleanShotRate,50);
 assert.equal(exported.cleanShots,3);
 assert.equal(exported.evaluatedShots,6);
 assert.equal(exported.unratedShots,2);
 assert.equal(exported.unifiedShots.length,8);
 assert.equal(exported.holes[0].shots[2].evaluation.shotQualityTier,'unrated');
 assert.equal(exported.holes[0].shots[2].evaluation.shotQualityLabel,'未評価');
 assert.equal(exported.holes[0].shots[2].evaluation.shotQualityEvaluation.evaluated,false);
 assert.equal(exported.holes[0].shots[2].evaluation.resultTier,'perfect');
 assert.equal(exported.unifiedShots[2].evaluation.shotQualityTier,'unrated');
 assert.equal(exported.unifiedShots[2].evaluation.resultTier,'perfect');
 assert.deepEqual(shots,original);
});
test('existing scoring and input are not made mandatory',()=>{
 assert.match(html,/gaResultImpactEditor|gaResultImpactEditor|gaResultImpactEditor|gaResultImpactEditor|gaResultImpactEditor|gaResultImpactEditor|gaResultImpactEditor/);
 assert.match(html,/gaEvaluateResult\(\{baseTier:/);
 assert.match(html,/onConfirm:zl/);
 assert.match(html,/onConfirm:gi/);
 assert.match(html,/cleanShotRate:evaluatedShots\?Math\.round\(cleanShots\/evaluatedShots\*100\):null/);
});
