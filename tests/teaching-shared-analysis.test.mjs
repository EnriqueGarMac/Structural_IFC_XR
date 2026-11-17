import test from 'node:test';
import assert from 'node:assert/strict';
import {setupTeachingAnalysis} from '../src/teaching-analysis-ui.js';

const fakeElement=()=>({
  dataset:{},classList:{add(){},remove(){}},hidden:false,disabled:false,
  value:'',textContent:'',style:{},options:[],listeners:{},
  closest(){return fakeElement();},
  setAttribute(){},
  querySelector(){return fakeElement();},
  replaceChildren(...children){this.options=children;},
  addEventListener(name,callback){this.listeners[name]=callback;}
});
test('educational analysis reuses main selector and legend, without cloned result tables',()=>{
  const elements=new Map();
  const getElementById=id=>{
    if(!elements.has(id))elements.set(id,fakeElement());
    return elements.get(id);
  };
  const previousDocument=globalThis.document,previousOption=globalThis.Option;
  globalThis.document={getElementById,body:{classList:{add(){},remove(){}}}};
  globalThis.Option=class Option{constructor(label,value){this.label=label;this.value=value;}};
  try{
    const app={};
    setupTeachingAnalysis(app);
    const response={
      bars:[
        {id:'B1',i:'A',j:'B',axial_kN:-5,stress_MPa:-1,strain:-.001},
        {id:'B2',i:'B',j:'C',axial_kN:10,stress_MPa:2,strain:.002}
      ],
      reactions:[{nodeId:'A',rx_kN:0,rz_kN:5}],
      displacements:[{nodeId:'A',ux_m:0,uz_m:0},
        {nodeId:'B',ux_m:0,uz_m:.001},{nodeId:'C',ux_m:0,uz_m:0}],
      maxDisplacement_m:.001
    };
    const experience={
      model:{nodes:[
        {id:'A',x:0,z:0,fixX:true,fixZ:true},
        {id:'B',x:1,z:0},{id:'C',x:2,z:0,fixZ:true}
      ],bars:[{id:'B1',i:'A',j:'B'},{id:'B2',i:'B',j:'C'}]},
      mode:'axial',ampFactor:1,palette:'classic',showAxialLabels:false,
      setMode(value){this.mode=value;app.updateTeachingAnalysis('truss',response,this);},
      setAmplification(value){this.ampFactor=value;app.updateTeachingAnalysis('truss',response,this);},
      setAxialLabels(value){this.showAxialLabels=value;app.updateTeachingAnalysis('truss',response,this);}
    };
    app.updateTeachingAnalysis('truss',response,experience);
    assert.equal(getElementById('analysis-view').value,'forces');
    assert.equal(getElementById('legend-title').textContent,'ESFUERZO AXIAL N');
    assert.match(getElementById('legend-min').textContent,/−?5,00|\-5,00/);
    assert.match(getElementById('legend-max').textContent,/10,00 kN/);
    app.teachingAnalysis.selectView('reactions');
    assert.equal(getElementById('analysis-view').value,'reactions');
    assert.equal(getElementById('reaction-values-controls').hidden,false);
    assert.equal(getElementById('force-values-controls').hidden,true);
    app.teachingAnalysis.toggleReactionValues();
    assert.equal(getElementById('toggle-reaction-values').textContent,
      'Ocultar valores de reacciones');
    app.teachingAnalysis.selectView('forces');
    assert.equal(getElementById('force-component').value,'P');
    assert.equal(app.teachingAnalysis.selectComponent('M3'),false,
      'Pin-jointed trusses must not expose nonexistent bending diagrams');
    app.teachingAnalysis.selectView('deformation');
    assert.equal(experience.mode,'displacement');
    app.teachingAnalysis.setAmplification(45);
    assert.equal(experience.ampFactor,3);
    app.teachingAnalysis.toggleAxialValues();
    assert.equal(experience.showAxialLabels,true);
    app.clearTeachingAnalysis();
    assert.equal(getElementById('analysis-view').value,'deformation');
    assert.equal(getElementById('analysis-view').options.length,5);
  }finally{
    globalThis.document=previousDocument;
    globalThis.Option=previousOption;
  }
});
