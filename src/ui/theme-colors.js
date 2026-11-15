import {isColor} from '../core/colors.js';

// Contrast samples are opaque six-digit hex tokens, independent of glass alpha.
export function colorSurface({effect='',documentMode=false,effects=true}={}) {
  const styles=getComputedStyle(document.documentElement);
  const kind=documentMode?'document':effects&&['memory','dream'].includes(effect)?effect:'';
  const value=styles.getPropertyValue(`--contrast-${kind?kind+'-':''}surface`).trim();
  if(isColor(value))return value;
  return styles.getPropertyValue('--contrast-surface').trim();
}
