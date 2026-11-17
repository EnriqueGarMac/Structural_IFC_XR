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
        {id:'B1',axial_kN:-5,stress_MPa:-1,strain:-.001},
        {id:'B2',axial_kN:10,stress_MPa:2,strain:.002}
      ],
      reactions:[{rx_kN:0,rz_kN:5}],displacements:[{ux_m:0,uz_m:.001}],
      maxDisplacement_m:.001
    };
    const experience={
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
