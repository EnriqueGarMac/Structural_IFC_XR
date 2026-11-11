import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setupWorkspaceTabs} from '../src/workspace-tabs.js';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=file('index.html'),theme=file('src/studio-theme.css'),main=file('src/main.js');

test('scientific workbench separates model, analysis, visualization and settings',()=>{
  const names=['model','analysis','view','advanced'];
  for(const name of names){
    assert.match(html,new RegExp('id="tab-'+name+'"[^>]*role="tab"|'+'role="tab"[^>]*id="tab-'+name+'"'));
    assert.match(html,new RegExp('id="panel-'+name+'"[^>]*role="tabpanel"'));
    assert.match(html,new RegExp('aria-controls="panel-'+name+'"'));
    assert.match(html,new RegExp('aria-labelledby="tab-'+name+'"'));
  }
  assert.equal((html.match(/class="workspace-panel/g)||[]).length,4);
  assert.match(main,/setupWorkspaceTabs\(\)/);
  assert.match(main,/import '\.\/studio-theme\.css'/);
  assert.match(theme,/grid-template-columns:310px minmax\(0,1fr\)/);
  assert.match(theme,/--studio-paper:#f6f7f5/);
  assert.match(theme,/--studio-stage:#242d33/);
  assert.match(theme,/@media\(max-width:700px\)/);
});
test('existing viewer, IFC, structural and XR controls keep stable unique IDs',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(const id of [
    'ifc-input','sap-input','demo-btn','roof-demo-btn','download-demo-ifc',
    'download-demo-json','analysis-view','case-select','force-component',
    'mode-select','amp','model-size','show-frames','show-original',
    'show-displaced','show-sap-only','ifc-rotation','fit-ifc','apply-offset',
    'ifc-transparency','ifc-opacity-scope','hide-ground','show-supports',
    'legend','legend-palette-toggle','result-palette','canvas-wrap',
    'btn-3d','btn-cam','btn-xr','btn-vr','btn-mobile-ar','reset-view',
    'scene-label','xr-status','status-summary','mobile-ar-place'
  ])assert.ok(ids.includes(id),'Missing control ID '+id);
  const calls=[...main.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
  for(const id of new Set(calls))assert.ok(ids.includes(id),'JS uses absent DOM ID '+id);
});
function stubTab(name){
  const listeners={},classes=new Set();
  return {dataset:{tab:name},classList:{
      toggle(key,on){if(on)classes.add(key);else classes.delete(key);},
      contains(key){return classes.has(key);}
    },
    setAttribute(k,v){this[k]=v;},
    addEventListener(k,fn){listeners[k]=fn;},
    focus(){this.focused=true;},
    fire(k,event={}){listeners[k]?.(event);},
    get tabIndex(){return this.index;},set tabIndex(v){this.index=v}
  };
}
function stubPanel(name){
  const classes=new Set();
  return {id:'panel-'+name,hidden:name!=='model',classList:{
    toggle(key,on){if(on)classes.add(key);else classes.delete(key);},
    contains(key){return classes.has(key);}
  }};
}
test('workspace tabs are accessible by pointer and keyboard, one visible panel at a time',()=>{
  const names=['model','analysis','view','advanced'];
  const tabs=names.map(stubTab),panels=names.map(stubPanel);
  const root={querySelectorAll(s){
    if(s==='[role="tab"][data-tab]')return tabs;
    if(s==='[role="tabpanel"]')return panels;
    throw Error('Unexpected selector '+s);
  }};
  const ui=setupWorkspaceTabs(root);
  assert.equal(ui.tabs.length,4);
  assert.equal(panels.filter(p=>!p.hidden).length,1);
  tabs[2].fire('click');
  assert.equal(panels.find(p=>!p.hidden).id,'panel-view');
  assert.equal(tabs[2]['aria-selected'],'true');
  assert.equal(tabs[0]['aria-selected'],'false');
  assert.equal(tabs[2].tabIndex,0);
  let prevented=false;
  tabs[2].fire('keydown',{key:'ArrowRight',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(panels.find(p=>!p.hidden).id,'panel-advanced');
  assert.equal(tabs[3].focused,true);
  tabs[3].fire('keydown',{key:'Home',preventDefault(){}});
  assert.equal(panels.find(p=>!p.hidden).id,'panel-model');
  assert.equal(ui.selectTab('wrong'),false);
});
test('interface retains scientific status, result legend and direct AR entry',()=>{
  assert.match(html,/id="legend-palette-toggle"/);
  assert.match(html,/id="footer-metrics"|class="footer-metrics"/);
  assert.match(html,/id="mobile-ar-overlay"/);
  assert.match(html,/id="mobile-ios-actions"/);
  assert.match(html,/imis-structural-xr-mark\.svg/);
  assert.doesNotMatch(html,/Explora una estructura<br>/);
  assert.match(theme,/prefers-reduced-motion/);
});
