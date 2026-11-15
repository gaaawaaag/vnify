import {normalizeAppearance} from '../reader/appearance.js';
import {t} from '../reader/player-text.js';

const key='vn-appearance',root=document.documentElement,$=id=>document.getElementById(id);
let settings=normalizeAppearance();
try {settings=normalizeAppearance(JSON.parse(localStorage.getItem(key)||'null'));}catch {}

// A theme may fix some of these (registry `fixed`); its own values then apply and the control is disabled.
const fixedByTheme=name=>(globalThis.VNTheme?.themes.find(theme=>theme.id===globalThis.VNTheme.active)?.fixed??[]).includes(name);
function sync(){
  const fixed=fixedByTheme('dialogueTransparency');
  if(fixed)root.style.removeProperty('--dialogue-alpha');
  else root.style.setProperty('--dialogue-alpha',String(1-settings.dialogueTransparency/100));
  $('dialogue-transparency').value=settings.dialogueTransparency;$('dialogue-transparency').disabled=fixed;
  $('dialogue-transparency').closest('.setting-row')?.classList.toggle('is-fixed',fixed);
  $('dialogue-transparency-value').textContent=fixed?t('主题'):settings.dialogueTransparency+'%';
  root.style.setProperty('--dialogue-lines',String(settings.dialogueLines));
  $('dialogue-lines').value=settings.dialogueLines;
  $('dialogue-lines-value').textContent=t('{n} 行',{n:settings.dialogueLines});
  // Line spacing is a step from the default of the open work's language; the label shows the resulting spacing.
  root.style.setProperty('--reading-line-step',String(settings.lineSpacing));
  $('line-spacing').value=settings.lineSpacing;
  const base=Number.parseFloat(getComputedStyle(root).getPropertyValue('--reading-line-base'))||1.95;
  $('line-spacing-value').textContent=(base+settings.lineSpacing/10).toFixed(2);
  // Portraits stand on stage and variants show; the settings no longer offer other choices.
  root.dataset.portraitDisplay='standing';root.dataset.variants='on';
  window.dispatchEvent(new Event('vn-appearance-change'));
}
// Theme choices are written by VNTheme; keep whatever is stored for them.
function save(){
  let stored={};try {stored=JSON.parse(localStorage.getItem(key)||'null')||{};}catch {}
  try {localStorage.setItem(key,JSON.stringify({...settings,theme:stored.theme,bookThemes:stored.bookThemes}));}catch {}
}
for(const [id,name] of [['dialogue-transparency','dialogueTransparency'],['dialogue-lines','dialogueLines'],['line-spacing','lineSpacing']])$(id).oninput=()=>{
  settings=normalizeAppearance({...settings,[name]:Number($(id).value)});
  sync();save();
};
window.addEventListener('storage',event=>{
  if(event.key!==key&&event.key!==null)return;
  try {settings=normalizeAppearance(JSON.parse(event.newValue||'null'));}catch {settings=normalizeAppearance();}
  sync();
});
window.addEventListener('vn-theme-change',sync);
// The player's language follows the open work (src/ui/app.js); the value labels follow it.
window.addEventListener('vn-language-change',sync);
sync();
