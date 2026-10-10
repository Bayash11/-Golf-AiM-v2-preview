'use strict';
/* Smoke tests for the real home-screen functions in index.html.
 * Uses Node built-ins only; callbacks and data are test doubles.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extract(a,b){
 const i=html.indexOf(a),j=html.indexOf(b,i);
 assert.ok(i>=0&&j>i,'Missing source boundary '+a);
 return html.slice(i,j);
}
const chartSource=extract('function GaHomeSuccessChart({rows})','function GaHowToGuide(');
const homeSource=extract('Ep=function({onCourse,onRandom10,onHistory,onSettings,onHowTo})','const baseGenerate=O1;');
const navSource=extract("GaBottomNav=function({active='home'","function GaShotStyleSettingsScreen(");
function fixture(){
 const events=[];
 const AH=(tag,props,...children)=>({tag,props:props||{},children});
 const context=vm.createContext({
  AH,
  P:{Fragment:'fragment',useState(value){return [value,()=>{}]},useEffect(){}},
  gaSvgIcon:(name)=>({icon:name}),
  gaHomeGrowthRows:()=>[],
  gaRunAndResetTop:(fn)=>{events.push('reset-top');fn&&fn()},
  L1:async()=>[],H1:async()=>[],
  AimClubAnalysis:()=>null,
  document:{querySelector(){return{scrollIntoView(opts){events.push('scroll:'+opts.block)}}}},
  window:{scrollTo(){events.push('scrollTop')}},
  console
 });
 vm.runInContext(chartSource+'\n'+navSource+'\n'+homeSource,context);
 return{context,events};
}
function collect(root,fn,into=[]){
 if(!root||typeof root!=='object')return into;
 if(fn(root))into.push(root);
 for(const child of root.children||[])collect(child,fn,into);
 return into;
}
function named(root,name){return collect(root,x=>((x.props||{}).className||'').split(' ').includes(name))}
const dummy={date:'2026-10-10',key:'2026-10-10',label:'10/10',rate:80,randomCount:2,courseCount:1,totalSessions:3};
test('inline scripts remain syntactically valid JavaScript',()=>{
 let count=0;
 for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
  const attrs=match[1],code=match[2];
  if(!code.trim()||/type\s*=\s*["'](?:application\/json|text\/template)/i.test(attrs))continue;
  assert.doesNotThrow(()=>new vm.Script(code), 'parse failed at inline script '+count);
  count++;
 }
 assert.ok(count>=1);
});
test('two wide practice cards use real navigation callbacks',()=>{
 const {context}=fixture();const calls=[];
 const home=vm.runInContext('Ep',context)({
  onRandom10:()=>calls.push('random'),onCourse:()=>calls.push('course'),
  onHistory:()=>{},onSettings:()=>{},onHowTo:()=>{}
 });
 const modes=named(home,'ga-home-tile');
 assert.equal(modes.length,2);
 modes[0].props.onClick();modes[1].props.onClick();
 assert.deepEqual(calls,['random','course']);
 assert.match(JSON.stringify(home),/今日は何を練習する/);
 assert.match(JSON.stringify(home),/練習履歴/);
 assert.match(JSON.stringify(home),/各種設定/);
});
test('how-to, history and settings remain reachable from home',()=>{
 const {context}=fixture();const events=[];
 const home=vm.runInContext('Ep',context)({
  onRandom10:()=>{},onCourse:()=>{},onHistory:()=>events.push('history'),
  onSettings:()=>events.push('settings'),onHowTo:()=>events.push('guide')
 });
 named(home,'ga-home-howto')[0].props.onClick();
 const links=named(home,'ga-home-quick-link');
 links[0].props.onClick();links[1].props.onClick();
 assert.deepEqual(events,['guide','history','settings']);
});
test('existing success-rate line and stacked practice charts both survive',()=>{
 const {context}=fixture();
 const growth=vm.runInContext('GaHomeGrowth',context)({rows:[dummy],onOpen:()=>{}});
 const charts=collect(growth,x=>x.tag===context.GaHomeSuccessChart||x.tag===context.GaHomePracticeChart);
 assert.equal(charts.length,2);
 assert.equal(named(growth,'ga-home-growth-metric').length,2);
 const success=vm.runInContext('GaHomeSuccessChart',context)({rows:[dummy]});
 assert.equal(success.props['aria-label'],'直近5練習日のショット成功率');
 const practice=vm.runInContext('GaHomePracticeChart',context)({rows:[dummy]});
 const colored=collect(practice,x=>x.tag==='rect').map(x=>x.props.fill);
 assert.deepEqual(colored.sort(),['#2F6FE4','#FF6A24'].sort());
});
test('empty chart data remains handled without misleading metrics',()=>{
 const {context}=fixture();
 const growth=vm.runInContext('GaHomeGrowth',context)({rows:[],onOpen:()=>{}});
 assert.equal(named(growth,'ga-home-growth-empty').length,1);
 assert.equal(named(growth,'ga-home-growth-metric').length,0);
});
test('home practice navigation scrolls to the cards without immediately resetting to top',()=>{
 const {context,events}=fixture();
 const nav=vm.runInContext('GaBottomNav',context)({
  active:'home',onHome:()=>{},onPractice:()=>events.push('practice'),
  onData:()=>events.push('data'),onSettings:()=>{}
 });
 nav.children[1].props.onClick();
 assert.deepEqual(events,['practice']);
 nav.children[2].props.onClick();
 assert.deepEqual(events,['practice','reset-top','data']);
});
test('phone layout uses one full-width mode column and fixed UI safe areas',()=>{
 assert.match(html,/id="ga-home-layout-20261010"/);
 assert.match(html,/\.ga-home-v2 \.ga-home-practice-grid\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
 assert.match(html,/\.ga-home-v2 \.ga-home-practice-grid \.ga-home-tile\s*\{[^}]*min-height:116px/);
 assert.match(html,/scroll-margin-top:calc\(var\(--ga-home-header-height\)/);
 assert.match(html,/env\(safe-area-inset-top/);
 assert.match(html,/AH\(GaBottomNav,\{active:'home'/);
 assert.match(html,/gaPersistSession\(/);
});
