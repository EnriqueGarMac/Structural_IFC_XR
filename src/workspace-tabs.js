// Accessible tab navigation for the engineering workbench.
// Operates on existing DOM nodes and does not touch analysis or XR state.
export function setupWorkspaceTabs(root=document){
  const tabs=[...root.querySelectorAll('[role="tab"][data-tab]')];
  const panels=[...root.querySelectorAll('[role="tabpanel"]')];
  const tabMap=new Map(tabs.map(tab=>[tab.dataset.tab,tab]));
  const panelMap=new Map(panels.map(panel=>[panel.id.replace(/^panel-/,''),panel]));
  if(tabs.length!==4||panels.length!==4||
     tabs.some(tab=>!panelMap.has(tab.dataset.tab)))throw new Error('Pestañas del visor incompletas.');
  function selectTab(name,{focus=false}={}){
    const target=tabMap.get(name);
    if(!target)return false;
    for(const tab of tabs){
      const active=tab===target;
      tab.classList.toggle('is-active',active);
      tab.setAttribute('aria-selected',String(active));
      tab.tabIndex=active?0:-1;
      const panel=panelMap.get(tab.dataset.tab);
      panel.hidden=!active;
      panel.classList.toggle('is-current',active);
    }
    if(focus)target.focus();
    return true;
  }
  for(const [index,tab] of tabs.entries()){
    tab.addEventListener('click',()=>selectTab(tab.dataset.tab));
    tab.addEventListener('keydown',event=>{
      let next=index;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=tabs.length-1;
      else return;
      event.preventDefault();
      selectTab(tabs[next].dataset.tab,{focus:true});
    });
  }
  selectTab('model');
  return {selectTab,tabs,panels};
}
