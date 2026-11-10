// Which analysis controls affect each results view. Controls that do not
// apply stay in place but frozen, so the panel layout does not jump and the
// student sees that they have no effect on the current view.
export const VIEW_CONTROLS=Object.freeze({
  deformation:Object.freeze(['case','pattern','amplification','loads','displaced']),
  forces:Object.freeze(['case','component']),
  reactions:Object.freeze(['case']),
  modes:Object.freeze(['mode','displaced']),
  // Buckling shows the reference loads of the case, not a selectable pattern.
  buckling:Object.freeze(['mode','loads','displaced'])
});
export function isControlActive(view,control){
  return (VIEW_CONTROLS[view]??VIEW_CONTROLS.deformation).includes(control);
}
