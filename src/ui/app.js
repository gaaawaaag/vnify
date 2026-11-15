import {createReaderChrome} from './reader-chrome.js';
import {installTouchGuard} from './touch-guard.js';
import {createBacklog} from './backlog.js';
import {colorSurface as themeColorSurface} from './theme-colors.js';
import {variantAt,statureOf} from '../core/variants.js';
import { parseScript } from '../core/parser.js';
import { characterColor } from '../core/colors.js';
import {ReaderState, prepareReading} from '../reader/reader-state.js';
import {createReaderStore} from '../reader/reader-store.js';
import { createCastPanel } from './cast-panel.js';
import {termsAt} from '../reader/character-data.js';
import { createCharacterHover } from './character-hover.js';
import { chapterProgress } from '../reader/reader-session.js';
import { createDisclosureTracker } from '../reader/reader-presentation.js';
import { createBackgroundPanel } from './background-panel.js';
import {createGalleryPanel} from './gallery-panel.js';
import {createReferencePanel} from './reference-panel.js';
import {createSettingsSample} from './settings-panel.js';
import {attachScrollMark} from './scroll-mark.js';
import { linkPackage } from '../reader/story-package.js';
import {preload} from './image-preload.js';
import {createCharacterImageSession} from '../reader/character-image-session.js';
import {DEFAULT_FLIP} from '../reader/character-images.js';
import {createDialogueAvatar,createStandingStage} from './dialogue-avatar.js';
import {stageAt} from '../reader/staging.js';
import {createTitleScreen} from './title-screen.js';
import {createExtraPanel} from './extra-panel.js';
import {createLibraryClient,libraryKey} from '../reader/library-client.js';
import {createReadingClock} from '../reader/reading-time.js';
import {createBookshelf} from './bookshelf.js';
import {createHomePage} from './home-page.js';
import {createLanguageMenu} from './shelf-language.js';
import {filesOfArchive,filesOfFolder,filesOfText,inspectFiles,uploadBook} from './book-import.js';
import {t,listText,setTextLanguage,translateInterface,typingInterval,readingMs} from '../reader/player-text.js';
const reader=new ReaderState();
const readerStore=createReaderStore();
const library=createLibraryClient();
const deviceId=readerStore.deviceId(),readingClock=createReadingClock();
// Shelf key of the book in the reader; progress and content are written to that shelf entry.
let shelfKey=null;
// Character colours come from the book; the settings no longer offer overrides.
const colorOverrides={};
const $ = id => document.getElementById(id);
// How the reader last interacted: focus moved by code or by an opening dialog shows its ring only after keyboard use.
document.addEventListener('pointerdown',()=>{document.documentElement.dataset.input='pointer';},true);
document.addEventListener('keydown',()=>{document.documentElement.dataset.input='keyboard';},true);
// Moves into the text after each unit's last character, so it is kept by reference while detached.
const advanceHint=$('advance-hint');
let timer, autoTimer, toastTimer, saveTimer;
let saved=null, textRuns=[], introTimer, introVersion=0, titleVersion=0;
const titleScreen=createTitleScreen();
let displayedUnitId=null,documentSaveTimer;
const paperDocument = () => reader.isDocument && reader.story.units[reader.index].block.style !== 'verse';
const mentionColor = id => paperDocument()
  ?characterColor(reader.story.book.id,reader.story.entities.get(id),colorOverrides,themeColorSurface({documentMode:true})):personColor(id);
function rememberScroll() {
  if(reader.isDocument&&reader.story.units[reader.index].id===displayedUnitId)reader.rememberDocumentScroll($('reading-body').scrollTop);
}
const disclosures=createDisclosureTracker();
let noticeTimer,noticeHideTimer,noticeKey='',noticePerson=null;
// Conservative surface samples include glass compositing over light/dark images.
const colorSurface = () => themeColorSurface({effects:settings.effects,effect:reader.story?.units[reader.index]?.effect});
const personColor = id => characterColor(reader.story.book.id, reader.story.entities.get(id), colorOverrides, colorSurface());
let settings=readerStore.readSettings();
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5000); }
/* Save state beside the place: a circle with a tick when saved, spinning while saving, marked when it failed.
 * The text stays for screen readers; an image upload to the shelf also shows its count. */
function setSaveState(state,text) {
  $('save-status').dataset.state=state;$('save-text').textContent=text;
  $('save-status').title=text;
}
// Progress is a small record kept apart from the book's text and images.
function save(immediate=false) {
  if (!reader.story) return Promise.resolve();
  saved=reader.snapshot();
  const {raw,...progress}=saved,key=shelfKey,record={...progress,chapter:reader.story.units[reader.index]?.chapter.title??''};
  clearTimeout(saveTimer);
  if(!key){setSaveState('','');return Promise.resolve();}
  if(replaced(key))return Promise.resolve();
  if(!uploading.has(key))setSaveState('saving',t('保存中…'));
  // The version lets the shelf refuse a position in a text another import has replaced.
  record.version=opened?.version;record.device=deviceId;
  return new Promise(resolve=>{
    saveTimer = setTimeout(async () => {
      try {
        const result=await library.saveProgress(key,record);
        if(result?.savedAt)progressStamps.set(key,result.savedAt);
        if(shelfKey===key&&!uploading.has(key))setSaveState('saved',t('进度已保存'));
      }
      catch(error) {
        if(error.status===409)markReplaced(key);
        else {setSaveState('failed',t('未能保存'));toast(t('书架存储不可用，当前仍可试读；关闭后进度可能丢失。'));}
      }
      resolve();
    }, immediate?0:80);
  });
}
/* Reading time (src/reader/reading-time.js): inputs on the reading screen while the page is in front count; sessions
 * go to the shelf every minute and when the page is hidden or the reader closed. A failed save is tried again later,
 * except when the shelf refuses it (the book was removed). */
function noteReading() {
  if(shelfKey&&reader.story&&!$('reader').hidden&&$('title-screen').hidden&&!document.hidden)readingClock.activity(shelfKey,reader.index,opened?.version);
}
function saveSessions() {
  for(const item of readingClock.take()) {
    library.saveSession(item.key,deviceId,item.session).catch(error=>{if(!(error.status>=400&&error.status<500))readingClock.restore([item]);});
  }
}
setInterval(saveSessions,60_000);
for(const type of ['pointerdown','keydown','wheel'])window.addEventListener(type,noteReading,{capture:true,passive:true});
function stopTimers() { clearTimeout(timer); clearTimeout(autoTimer); endIntro(); }
function setAuto(value) {
  reader.auto = value; $('auto').setAttribute('aria-pressed', String(reader.auto));
  // While playing on its own, the continue mark circles instead of pointing down.
  $('reader').classList.toggle('auto-playing', reader.auto);
  clearTimeout(autoTimer); if (reader.auto && reader.visible >= reader.glyphs.length) scheduleAuto();
}
function scheduleAuto() {
  clearTimeout(autoTimer);
  if (characterHover.visible || !reader.auto || !reader.story || reader.autoWaiting || reader.intro || document.hidden || document.querySelector('dialog[open]')) return;
  if (reader.index === reader.story.units.length - 1) { setAuto(false); return; }
  const reading = settings.speed === 0 ? readingMs(reader.glyphs.length) : 0;
  autoTimer = setTimeout(() => move(1), settings.delay * 1000 + reading);
}
function typeStep() {
  reader.typeStep(); paintText();
  if (reader.visible < reader.glyphs.length) timer = setTimeout(typeStep, typingInterval(settings.speed));
  else scheduleAuto();
}
function paintText() {
  let remaining = reader.visible;
  for (const run of textRuns) {
    if (run.retained) { run.node.textContent=run.glyphs.join('');run.node.hidden=false;continue; }
    run.node.textContent = run.glyphs.slice(0, Math.max(0, remaining)).join('');
    run.node.hidden=!run.node.textContent;
    remaining -= run.glyphs.length;
  }
  advanceHint.style.visibility = reader.visible >= reader.glyphs.length && !reader.intro ? 'visible' : 'hidden';
  // Past its height limit the dialogue scrolls its text as it types.
  const text=$('text');
  if(!reader.isDocument&&text.scrollHeight>text.clientHeight)text.scrollTop=text.scrollHeight;
  markTextScroll();
  updateCharacterLinks();
}
function endIntro() {
  introVersion++;clearTimeout(introTimer); reader.endIntro();
  $('scene-intro').hidden = true; $('chapter-intro').hidden=true;
  $('separator-intro').hidden=true;
  $('card').hidden = false; $('reading-stack').hidden=false;
  syncContext();
}
function startText() {
  endIntro();
  void backgroundPanel.render({scope:'scene',animate:settings.effects});
  if(reader.isDocument){$('reading-body').scrollTop=reader.documentScrollTop;completeText();}
  else if (settings.speed) typeStep(); else completeText();
}
function completeText() { clearTimeout(timer); endIntro();void backgroundPanel.render({scope:'scene',animate:settings.effects});reader.completeText(); paintText(); scheduleAuto(); }
async function playIntro() {
  const token=++introVersion,intro=reader.intro,u=reader.story.units[reader.index];
  clearTimeout(introTimer);
  $('scene-intro').hidden=$('chapter-intro').hidden=true;syncContext();
  $('separator-intro').hidden=intro.kind!=='separator'||!settings.effects;
  await backgroundPanel.render({scope:intro.kind==='separator'?'chapter':'scene',chapterId:intro.chapterId,animate:settings.effects});
  if(token!==introVersion||reader.intro!==intro)return;
  if(intro.kind==='chapter') {
    $('chapter-intro').hidden=false;
    $('chapter-kicker').textContent=intro.kicker;$('chapter-kicker').hidden=!intro.kicker;
    $('chapter-name').textContent=intro.title;
    $('chapter-detail').textContent=u.block.kind==='scene'?[u.block.title||u.location,u.block.time,settings.effects?{memory:t('回忆'),dream:t('梦境')}[u.effect]:''].filter(Boolean).join(' · '):'';
    $('chapter-detail').hidden=!$('chapter-detail').textContent;
  } else if(intro.kind==='scene') {
    $('scene-name').textContent=u.block.title||u.location;
    $('scene-detail').textContent=[u.block.time,settings.effects?{memory:t('回忆'),dream:t('梦境')}[u.effect]:''].filter(Boolean).join(' · ');
    $('scene-intro').hidden=false;
  }
  introTimer=setTimeout(advanceIntro,intro.duration);
}
function advanceIntro() {
  const next=reader.intro?.kind==='separator'?reader.intro.next:null;
  if(next){reader.intro=next;void playIntro();}
  else startText();
}
function render(mode = 'forward', previousIndex = null) {
  rememberScroll();
  characterHover.hide();
  stopTimers(); if (!reader.story) return;
  clearNotice(); disclosures.begin(mode);
  const {unit:u,runs:displayRuns,retainedUnits:authoredPage}=reader.beginUnit(mode,previousIndex);
  const instant=!['forward','start'].includes(mode);
  $('welcome').hidden = true; $('reader').hidden = false;
  $('book-title').textContent = reader.story.book.title; $('chapter-title').textContent = u.chapter.title;
  $('context-place').textContent=u.block.title || u.location || '';
  $('context-time').textContent=u.block.time || '';
  $('speaker').textContent = u.speaker;
  $('speaker').dataset.character=u.speakerId || '';
  $('speaker').hidden = !u.speaker;
  $('speaker').disabled = !u.speakerId;
  $('thought-label').hidden = u.kind !== 'thought';
  const verse=reader.isDocument&&u.block.style==='verse';
  $('document-actions').hidden=!reader.isDocument||verse;
  $('reader').classList.toggle('document-mode', reader.isDocument);
  $('reader').classList.toggle('verse-mode', verse);
  $('stage').setAttribute('aria-label',t(reader.isDocument?'资料阅读区域，右方向键继续':'阅读区域，空格或右方向键推进'));
  const effectLabel=settings.effects ? ({memory:t('回忆'),dream:t('梦境')}[u.effect] || '') : '';
  $('reader').classList.toggle('memory-mode',!reader.isDocument&&effectLabel&&u.effect==='memory');
  $('reader').classList.toggle('dream-mode',!reader.isDocument&&effectLabel&&u.effect==='dream');
  $('speaker-row').hidden = reader.isDocument && !u.speaker && !effectLabel;
  // The avatar view keeps its own class while the same image stays; resetting the kind must not drop it.
  $('card').className = 'reading-card ' + u.kind + (effectLabel&&!reader.isDocument ? ` ${u.effect}` : '');
  $('card').classList.toggle('has-portrait', !!$('dialogue-avatar'));
  // A verse fades in once when reached by reading forward; any click shows it whole.
  $('card').classList.toggle('verse-enter', verse&&!instant&&settings.effects);
  if (u.speakerId) $('card').style.setProperty('--character-color', personColor(u.speakerId));
  else $('card').style.removeProperty('--character-color');
  $('memory').hidden = !effectLabel;
  $('memory').textContent = effectLabel;
  updateReaderProgress();
  $('source-info').textContent = `${u.block.id} · 第 ${u.line} 行 · 来源 ${u.source.join(', ') || '未标注'}`;
  $('source-info').hidden = !settings.debug;
  $('stage').scrollTop = 0;$('card').scrollTop = 0;
  buildText(authoredPage,displayRuns);
  $('card').hidden = Boolean(reader.intro); $('reading-stack').hidden=Boolean(reader.intro); paintText();
  syncContext();
  displayedUnitId=u.id;
  $('reading-body').scrollTop=reader.documentScrollTop;
  if (reader.intro) void playIntro();
  else {void backgroundPanel.render({scope:'scene',animate:settings.effects});if(settings.speed&&!instant&&!reader.isDocument)typeStep();else completeText();}
  preloadAhead();
  save();
}
// The next lines' images start loading now: backgrounds, CG and Cut-ins, and the portraits of who speaks.
// Loading is not showing: a portrait asked for here stays off screen until its character is disclosed.
function preloadAhead() {
  backgroundPanel.preloadAhead();
  const story=reader.story,bookId=story?.book.id,display=document.documentElement.dataset.portraitDisplay;
  if(!story||display==='none')return;
  const variants=document.documentElement.dataset.variants!=='off';
  for(let i=reader.index+1;i<=Math.min(reader.index+6,story.units.length-1);i++) {
    const id=story.units[i].speakerId;
    // The look that line will show: its variant there, a standing portrait unless only avatars are shown.
    if(id)preload(characterImageSession.avatar(bookId,id,new Set([id]),variants?variantAt(story,id,i):null,
      {includeStanding:display==='standing'})?.image.src);
  }
}
// The scene label stays on screen during scenes; interludes show their own titles.
function syncContext() {
  const u=reader.story?.units[reader.index];
  $('context').hidden=!u||Boolean(reader.intro)||u.block.kind!=='scene'||!(u.block.title||u.location||u.block.time);
  $('open-terms').hidden=!reader.story||!termsAt(reader.characters,reader.index).length;
}
// Links are inline spans acting as buttons: a <button> is an atomic box, so a long name could not break across lines.
function mentionNode(run) {
    const node = document.createElement('span');
    if (run.characterId) {
      node.className = 'character-mention';
      node.dataset.character=run.characterId;
      node.onclick=event=>{event.stopPropagation();if(!characterHover.previewFirst(node))castPanel.open(run.characterId);};
      node.style.color = mentionColor(run.characterId);
    }
    if(run.annotation) {
      node.classList.add('annotation-mention');node.dataset.annotation=run.annotation.id;
      node.onclick=event=>{event.stopPropagation();characterHover.showNote(node);};
    }
    if(run.term) {
      node.className='term-mention';node.dataset.term=run.term;
      node.onclick=event=>{event.stopPropagation();characterHover.showNote(node);};
    }
    if(node.onclick) {
      node.role='button';node.tabIndex=0;
      node.onkeydown=event=>{
        if(event.key!=='Enter'&&event.key!==' ')return;
        event.preventDefault();event.stopPropagation();node.click();
      };
    }
    return node;
}
// Units of an authored page run together before the current unit.
function buildText(retainedUnits,currentRuns) {
  $('text').replaceChildren();
  const groups=[...retainedUnits.map(entry=>({runs:entry.runs,retained:true})),{runs:currentRuns,retained:false}];
  textRuns=[];
  // English sentences on one screen are separated by a space; Chinese ones run together.
  const gap=reader.story?.book.lang==='en'?' ':'';
  groups.forEach((group,k)=>{
    if(k&&gap)$('text').append(document.createTextNode(gap));
    for(const run of group.runs){
      const node=mentionNode(run);$('text').append(node);
      textRuns.push({node,glyphs:Array.from(run.text),retained:group.retained});
    }
  });
  $('text').append(advanceHint);
}
function move(delta) {
  if (!reader.story || $('cast-dialog').open) return;
  rememberScroll();
  const action=reader.advance(delta);noteReading();
  if(action.kind==='intro'){advanceIntro();return;}
  if(action.kind==='complete'){completeText();return;}
  if(action.kind==='end'){
    if(delta>0){setAuto(false);toast(t(reader.bookComplete?'本篇已读完。可回看历史。':'本章已读完，后续章节尚未就绪。'));}
    return;
  }
  if(action.kind==='move')render(action.mode,action.previousIndex);
}
async function refreshShelf() {
  await shelf.refresh();
}
function goHome() {
  titleVersion++;titleScreen.cancel();
  readingClock.finish();saveSessions();
  rememberScroll();const saving=save(true);characterHover.hide();setAuto(false); stopTimers();clearNotice();dialogueAvatar.clear();standingStage.clear();
  $('reader').classList.remove('dialogue-hidden');$('reader').hidden = true; $('welcome').hidden = false;
  void saving.then(refreshShelf);
  void VNTheme.activateDefault();
  setPlayerLanguage(languageMenu.language);
}
function openDialog(id) { characterHover.hide();setAuto(false); if (reader.story && !$('reader').hidden) completeText(); $(id).showModal(); }

function currentCast() { return reader.currentCast(); }
function updateCharacterLinks() {
  updateDialogueAvatar();
  characterHover.refresh();
  const notice=disclosures.observe(currentCast());
  if(reader.intro || !notice || noticeKey===notice.text)return;
  clearNotice(); noticeKey=notice.text; noticePerson=notice.id;
  const button=$('character-notice-button');
  button.textContent=notice.text;button.hidden=false;
  noticeTimer=setTimeout(()=>{
    // Do not remove a keyboard-focused notice; navigation clears it.
    if(document.activeElement===button)return;
    button.classList.add('fading');
    noticeHideTimer=setTimeout(()=>{button.hidden=true;},350);
  },4500);
}
function clearNotice() {
  clearTimeout(noticeTimer);clearTimeout(noticeHideTimer);noticeKey='';noticePerson=null;
  const button=$('character-notice-button');button.hidden=true;button.textContent='';button.classList.remove('fading');
}
const characterHover=createCharacterHover({getPerson:id=>currentCast().find(c=>c.id===id),colorFor:personColor,getAnnotation:id=>reader.story?.annotations.get(id),getTerm:id=>reader.characters?.glossary.terms.get(id),onVisibility:visible=>{clearTimeout(autoTimer);if(!visible&&reader.auto&&reader.textComplete)scheduleAuto();}});
const castPanel=createCastPanel({
  getCharacters:currentCast,
  getAvatar:id=>characterImageSession.avatar(reader.story?.book.id,id,new Set(currentCast().map(c=>c.id)),currentVariant(id)),
  colorFor:personColor,
  onOpen:pauseForPanel,
  onClose:resumeAfterPanel,
});
// Full-stage panels (cast, gallery) hold typing, auto play and intros while open, and pick them up on closing.
function pauseForPanel() {
  characterHover.hide();if(!reader.isDocument)setAuto(false);introVersion++;clearTimeout(timer);clearTimeout(autoTimer);clearTimeout(introTimer);
}
function resumeAfterPanel() {
  if(!reader.story || $('reader').hidden)return;
  if(reader.intro)void playIntro();
  else if(reader.visible<reader.glyphs.length)timer=setTimeout(typeStep,typingInterval(settings.speed));
}
const galleryPanel=createGalleryPanel({
  getBook:async()=>{
    if(!reader.story)return null;
    const backgrounds=await backgroundPanel.pictures(reader.story.book.id),extra=extraPanel.current();
    return {story:reader.story,backgrounds,extra:extra?.bookId===reader.story.book.id?extra.extra:null,
      furthest:reader.furthest,complete:reader.bookComplete};
  },
  onOpen:pauseForPanel,onClose:resumeAfterPanel,
});
$('open-cast').onclick=()=>castPanel.open();
$('open-backgrounds').onclick=()=>void galleryPanel.open();
// World terms met so far, in the order they first appeared; each says where it was first met.
const termsPanel=createReferencePanel({dialog:$('terms-dialog'),onOpen:pauseForPanel,onClose:resumeAfterPanel,empty:()=>t('还没有遇到词条。'),
  count:items=>t('已遇到 {n}',{n:items.length}),
  entries:()=>reader.story?termsAt(reader.characters,reader.index).map(term=>({id:term.id,title:term.label,summary:term.summary,
    search:term.aliases?.join(' ')??'',term})):[],
  detail:({term})=>{
    const nodes=[Object.assign(document.createElement('h3'),{className:'reference-title',textContent:term.label}),
      Object.assign(document.createElement('p'),{className:'reference-lead',textContent:term.summary})];
    const note=text=>Object.assign(document.createElement('p'),{className:'reference-meta',textContent:text});
    if(term.aliases?.length)nodes.push(note(t('又作 {names}',{names:listText(term.aliases)})));
    const first=reader.story.units[term.first],place=first?.block.title||first?.location;
    if(first)nodes.push(note([t('首次出现'),first.chapter.title,place].filter(Boolean).join(' · ')));
    return nodes;
  }});
$('open-terms').onclick=()=>termsPanel.open();
$('character-notice-button').onclick=event=>{event.stopPropagation();castPanel.open(noticePerson);};
$('speaker').onclick=event=>{
  event.stopPropagation();
  const id=reader.story?.units[reader.index].speakerId;
  if(id&&!characterHover.previewFirst($('speaker')))castPanel.open(id);
};

window.addEventListener('vn-theme-change',()=>{
  if(!reader.story)return;
  const speakerId=reader.story.units[reader.index]?.speakerId;
  if(speakerId)$('card').style.setProperty('--character-color',personColor(speakerId));
  for(const node of $('text').querySelectorAll('[data-character]'))node.style.color=mentionColor(node.dataset.character);
  for(const node of $('cast-body').querySelectorAll('[data-character]'))node.style.setProperty('--person-color',personColor(node.dataset.character));
  characterHover.refresh();
});
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
// The open book's manifests (images by address), kept so the same book reopens from memory.
let opened=null;
function importText(text, restored, {backgrounds,characterImages,extra,version}) {
  // Only an exactly unchanged file resumes: changed manuscripts start at the beginning.
  const previous=restored || (saved?.raw===text?saved:null);
  const work=prepareReading(text,{complete:previous?.complete!==false});
  const parsed=work.story;
  setAuto(false);reader.load(work,previous);
  shelfKey=libraryKey(parsed.book.id);
  if(previous?.savedAt)progressStamps.set(shelfKey,previous.savedAt);
  displayedUnitId=null;
  opened={backgrounds,characterImages,extra,version};if(replacedKey===libraryKey(parsed.book.id))replacedKey=null;
  characterImageSession.setStory(parsed,characterImages);
  backgroundPanel.setStory(parsed,backgrounds);
  extraPanel.setBook(parsed.book.id,extra);
  $('import-dialog').close();
  void openTitle(parsed,Number.isInteger(previous?.index)?'restore':'start');
}
// The reader and title screen use the chosen theme; home uses the default.
const VNTheme=globalThis.VNTheme;
const readerTheme=()=>reader.story?VNTheme.activate(VNTheme.global()):VNTheme.activateDefault();
// Every entry from home passes through the title screen; reading starts once it closes.
/* The player's interface, page language (fonts, hyphenation) and typing pace follow the open work's language; home is Chinese. */
const PLAYER_ROOTS=['reader','title-screen','gallery-dialog','cast-dialog','settings-dialog','cut-in-viewer','terms-dialog','appendix-dialog'];
const SHELF_ROOTS=['home-header','welcome','shelf-settings-dialog','shelf-dialog','book-info-dialog','import-dialog'];
// The interface language: the open work's, or the shelf's chosen one on the shelf.
function setPlayerLanguage(lang) {
  setTextLanguage(lang);
  document.documentElement.lang=lang==='en'||lang==='ja'||lang==='zh-Hant'?lang:'zh-CN';
  translateInterface([...SHELF_ROOTS,...PLAYER_ROOTS].map($));
  window.dispatchEvent(new Event('vn-language-change'));
  applySettings();
  shelf.relabel();homePage.relabel();
}
async function openTitle(story,mode) {
  const token=++titleVersion;
  $('welcome').hidden=true;$('reader').hidden=true;
  setPlayerLanguage(story.book.lang);
  await VNTheme.activate(VNTheme.global());
  if(token!==titleVersion)return;
  // Without a title card, the original book cover is shown whole.
  const card=await backgroundPanel.titleCard(story.book.id),cover=card?null:extraPanel.cover(story.book.id);
  if(token!==titleVersion)return;
  await titleScreen.show({title:story.book.title,author:story.book.author,src:card??cover,contain:!!cover,animate:settings.effects});
  if(token===titleVersion){render(mode);noteReading();}
}
/* Every import puts the book on the shelf first and then opens it from there. The files are checked before anything
 * is uploaded; a book already on the shelf with another text is replaced after confirmation (its position goes with it). */
function setImportBusy(busy) {
  $('import-dialog').classList.toggle('is-busy',busy);
  for(const id of ['file','folder'])$(id).disabled=busy;
}
async function importBook(load) {
  $('import-error').hidden=true;setImportBusy(true);
  let key=null;
  try {
    const files=await load(),book=await inspectFiles(files);
    key=libraryKey(book.story.book.id);
    const existing=shelf.find(key);
    if(existing&&await library.story(key)!==book.raw&&!await shelf.confirm({title:'替换书架上的作品',text:t('《{title}》',{title:existing.title}),action:'替换'}))return;
    // The copy in memory stops speaking for the shelf; the imported one replaces it.
    if(shelfKey===key)shelfKey=null;
    $('import-dialog').close();
    const {title,author}=book.story.book;
    uploading.add(key);
    await uploadBook(library,files,book,{onProgress:(done,total)=>{if(total)shelf.setUpload(key,{title,author,done,total});}});
    uploading.delete(key);shelf.setUpload(key,null);
    await refreshShelf();
    const listed=shelf.find(key);
    if(listed)await openFromShelf(listed);
  } catch(error) {
    if($('import-dialog').open){$('import-error').hidden=false;$('import-error').textContent=error.message;}
    else toast(t('作品未能放上书架：{m}',{m:error.message}));
  } finally {
    if(key){uploading.delete(key);shelf.setUpload(key,null);}
    setImportBusy(false);
  }
}
function updateReaderProgress() {
  if(!reader.story)return;
  const progress=chapterProgress(reader.story,reader.index);
  $('position').textContent=`${progress.current} / ${progress.total}`;
  $('progress').style.width=`${progress.current/progress.total*100}%`;
  const track=$('progress').parentElement;
  track.setAttribute('aria-valuenow',String(progress.current));track.setAttribute('aria-valuemax',String(progress.total));
  const last=reader.index===reader.story.units.length-1;
  advanceHint.firstChild.textContent=last ? t(reader.bookComplete?' 本篇完 · 可回看历史':' 本章完 · 等待后续章节') : ' ';
}
// Server time of the reading position each shelf book last loaded or saved here; a later one came from another device.
const progressStamps=new Map();
/* The shelf version (meta.updatedAt) the open book was read from. Once another import replaces it, this page stops
 * saving positions for the old text and says so once; reopening from the shelf reads the new version. */
let replacedKey=null;
const replaced=key=>replacedKey===key;
function markReplaced(key) {
  if(replacedKey===key)return;
  replacedKey=key;setSaveState('failed',t('作品已更新'));toast(t('这本作品已在别处更新，回到书架重新打开即可读新版本。'));
}
async function newerProgress(key) {
  const {progress:remote,updatedAt}=await library.opening(key);
  if(opened&&shelfKey===key&&updatedAt!==opened.version){markReplaced(key);return null;}
  if(!remote?.savedAt||remote.savedAt<=(progressStamps.get(key)??0))return null;
  progressStamps.set(key,remote.savedAt);
  return Number.isInteger(remote.index)&&remote.index!==reader.index?remote:null;
}
// Back on a page left open in the reader, a position saved later on another device takes over.
let following=false;
async function followOtherDevice() {
  const key=shelfKey;
  if(following||!key||!reader.story||$('reader').hidden||!$('title-screen').hidden)return;
  following=true;
  try {
    const remote=await newerProgress(key);
    if(!remote||shelfKey!==key||$('reader').hidden)return;
    setAuto(false);rememberScroll();
    reader.furthest=Math.max(reader.furthest,Math.min(remote.furthest??0,reader.story.units.length-1));
    const action=reader.seek(remote.index,'jump');render(action.mode,action.previousIndex);
    toast(t('已跳到其他设备上的阅读位置。'));
  } catch {} finally {following=false;}
}
let openingShelf=false;
async function openFromShelf(book) {
  if(openingShelf)return;
  openingShelf=true;
  try {
    // The open book reopens from memory while the shelf still holds the version it was read from.
    if(reader.story&&shelfKey===book.key&&opened&&opened.version===book.updatedAt) {
      const remote=await newerProgress(book.key).catch(()=>null);
      importText(reader.raw,remote?{...saved,...remote}:saved,opened);
      return;
    }
    // Only the text files are fetched; images load by address as the reading reaches them.
    shelf.setOpening(book.key,{phase:'read'});
    // Every text file is read from one version; an import landing in between makes the shelf refuse, and we read again.
    for(let attempt=0;;attempt++) {
      const {progress,updatedAt}=await library.opening(book.key),file=name=>library.file(book.key,name,updatedAt);
      try {
        const [manifest,story]=await Promise.all([file('manifest.json'),file('story.vn.txt')]);
        if(manifest===null||story===null)throw new Error('书架上的作品文件不完整，请重新导入。');
        const extra=JSON.parse(manifest).extra?await file('extra.json'):null;
        const linked=linkPackage(manifest,extra,name=>library.fileURL(book.key,name));
        importText(story,{...progress,complete:linked.complete},{...linked,version:updatedAt});
        return;
      } catch(error) {if(error.status!==409||attempt)throw error;}
    }
  } catch(error) {toast(error.message);}
  finally {openingShelf=false;shelf.setOpening(book.key,null);}
}
$('welcome-import').onclick = () => openDialog('import-dialog');
// The dialog imports as soon as a file or folder is chosen, or a file is dropped on it.
function importFile(file) {
  if (!/\.zip$/i.test(file.name) && file.size > 10 * 1024 * 1024) { $('import-error').hidden = false; $('import-error').textContent = '正文请控制在 10 MB 以内。'; return; }
  void importBook(async () => /\.zip$/i.test(file.name) ? filesOfArchive(file) : filesOfText(await file.text()));
}
$('file').onchange = event => {
  const file = event.target.files[0]; event.target.value = ''; if (file) importFile(file);
};
const importDialog = $('import-dialog');
importDialog.addEventListener('dragover', event => {
  if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); importDialog.classList.add('is-dropping'); }
});
importDialog.addEventListener('dragleave', event => { if (!importDialog.contains(event.relatedTarget)) importDialog.classList.remove('is-dropping'); });
importDialog.addEventListener('drop', event => {
  event.preventDefault(); importDialog.classList.remove('is-dropping');
  const file = event.dataTransfer?.files[0]; if (file && !importDialog.classList.contains('is-busy')) importFile(file);
});
$('folder').onchange = event => {
  const list = [...event.target.files]; event.target.value = ''; if (!list.length) return;
  void importBook(async () => filesOfFolder(list));
};
$('sample').onclick = () => importBook(async () => {
  const response = await fetch('examples/rainy-visit.vn.txt'); if (!response.ok) throw new Error('无法读取示例');
  return filesOfText(await response.text());
});
$('home').onclick = event => { event.preventDefault(); goHome(); };
installTouchGuard();
$('stage').onclick = () => {
  if ($('card').classList.contains('verse-enter')) { $('card').classList.remove('verse-enter'); return; }
  if (!reader.isDocument || $('reader').classList.contains('verse-mode')) move(1);
};
$('card').addEventListener('animationend', event => { if (event.animationName === 'verse-enter') $('card').classList.remove('verse-enter'); });
$('document-next').onclick = event => {event.stopPropagation();move(1);};
// Lines scrolled up fade out under the dialogue's top edge.
function markTextScroll() { $('text').classList.toggle('is-scrolled',$('text').scrollTop>0); }
$('text').addEventListener('scroll',markTextScroll,{passive:true});
$('reading-body').addEventListener('scroll',()=>{
  if(!reader.isDocument)return;
  rememberScroll();noteReading();clearTimeout(documentSaveTimer);
  documentSaveTimer=setTimeout(save,250);
},{passive:true});
$('auto').onclick = event => {event.stopPropagation();setAuto(!reader.auto);};
// The last 200 lines up to the reading position, for the backlog.
function backlogEntries() {
  if(!reader.story)return [];
  const start=Math.max(0,reader.index-199);
  return reader.story.units.slice(start,reader.index+1).map((u,i)=>({index:start+i,name:u.speaker||'',
    color:u.speakerId?personColor(u.speakerId):null,thought:u.kind==='thought',isDocument:u.block.kind==='document',text:u.text}));
}
function seekTo(position,mode) {rememberScroll();const action=reader.seek(position,mode);render(action.mode,action.previousIndex);}
const backlog=createBacklog({entries:backlogEntries,
  canOpen:()=>!!reader.story&&!$('reader').hidden&&!reader.intro&&!titleScreen.active&&!document.querySelector('dialog[open]')
    &&!$('reader').classList.contains('dialogue-hidden'),
  onOpen:()=>{characterHover.hide();setAuto(false);completeText();chrome.close();},
  onJump:index=>seekTo(index,'history')});
$('history').onclick = event => {event.stopPropagation();backlog.open();};
const chrome=createReaderChrome({reader:$('reader'),welcome:$('welcome'),header:$('home-header'),onClose:()=>toggleChapters(false)});
// Hiding the dialogue leaves the picture; the next click, key or wheel anywhere only brings it back.
function setDialogueHidden(hidden) {
  $('reader').classList.toggle('dialogue-hidden',hidden);
  if(hidden){characterHover.hide();setAuto(false);chrome.close();}
}
$('hide-dialogue').onclick=event=>{event.stopPropagation();setDialogueHidden(true);};
for(const type of ['click','keydown','wheel'])document.addEventListener(type,event=>{
  if(!$('reader').classList.contains('dialogue-hidden'))return;
  if(type==='keydown'&&(event.ctrlKey||event.metaKey||event.altKey||['Shift','Control','Alt','Meta'].includes(event.key)))return;
  event.preventDefault();event.stopPropagation();setDialogueHidden(false);
},{capture:true,passive:false});
// The title card opens a list of chapters under it; picking one jumps there.
function toggleChapters(open=$('chapter-list').hidden) {
  $('chapter-list').hidden=!open;$('open-contents').setAttribute('aria-expanded',String(open));
  if(!open||!reader.story)return;
  const current=reader.story.units[reader.index].chapter.id,items=[];
  for(const chapter of reader.story.chapters) {
    const first=reader.story.blocks.find(b=>b.chapterId===chapter.id);
    if(!first)continue;
    const button=document.createElement('button');button.type='button';button.textContent=chapter.title;
    if(chapter.id===current)button.setAttribute('aria-current','true');
    button.onclick=()=>{chrome.close();seekTo(first.index,'jump');};
    items.push(button);
  }
  $('chapter-list').replaceChildren(...items);
  $('chapter-list').querySelector('[aria-current]')?.scrollIntoView({block:'nearest'});
}
$('open-contents').onclick = () => toggleChapters();
function applySettings() {
  document.documentElement.style.setProperty('--font-size', settings.font + 'px');
  reader.setSplit(settings.split);
  for (const id of ['font','speed','delay']) $(id).value = settings[id];
  for (const button of document.querySelectorAll('#split [data-split]')) button.setAttribute('aria-pressed', String(button.dataset.split === settings.split));
  $('font-value').textContent = settings.font + 'px'; $('delay-value').textContent = t('{n} 秒',{n:settings.delay});
  try { readerStore.saveSettings(settings); } catch {}
  settingsSample.restart();
  if (reader.story && !$('reader').hidden) render('settings');
}
for (const id of ['font','speed','delay']) $(id).oninput = () => { settings[id] = Number($(id).value); applySettings(); };
for (const button of document.querySelectorAll('#split [data-split]')) button.onclick = () => { settings.split = button.dataset.split; applySettings(); };
// Development themes stay selectable only when already chosen (e.g. through VNTheme.setGlobal).
function fillThemes() {
  const option=(value,label)=>Object.assign(document.createElement('option'),{value,textContent:label});
  const listed=VNTheme.themes.filter(t=>!t.dev||t.id===VNTheme.global());
  $('theme-global').replaceChildren(...listed.map(t=>option(t.id,t.label)));
  $('theme-global').value=VNTheme.global();
}
$('theme-global').onchange=()=>{VNTheme.setGlobal($('theme-global').value);if(!$('reader').hidden)void readerTheme();};
window.addEventListener('vn-theme-preferences',()=>{if(!$('reader').hidden||!$('title-screen').hidden)void readerTheme();if($('settings-dialog').open)fillThemes();});
// The settings cover the stage like the other panels; a sample line beside them follows the choices as they change.
const settingsSample=createSettingsSample({getSettings:()=>settings});
$('reader-settings').onclick = () => {
  fillThemes();pauseForPanel();document.body.classList.add('stage-panel-open');
  settingsSample.start($('reader-background'));$('settings-dialog').showModal();
};
$('settings-dialog').addEventListener('close',()=>{document.body.classList.remove('stage-panel-open');settingsSample.stop();resumeAfterPanel();});
// The home page has its own settings for the shelf; reading settings open from inside a book.
$('open-settings').onclick = () => {
  $('shelf-rows').value=String(shelf.settings.rows);$('shelf-original-cover').checked=shelf.settings.originalCover;
  openDialog('shelf-settings-dialog');
};
$('shelf-rows').onchange = () => shelf.setSettings({rows:Number($('shelf-rows').value)});
$('shelf-original-cover').onchange = () => shelf.setSettings({originalCover:$('shelf-original-cover').checked});
$('reader-home').onclick = goHome;

document.addEventListener('keydown', event => {
  if (!reader.story || $('reader').hidden || titleScreen.active || document.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (backlog.key(event)) return;
  if (event.key === ' ' && /^(BUTTON|A)$/.test(event.target.tagName)) return;
  if(reader.isDocument&&[' ','PageDown','PageUp','ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
    event.preventDefault();
    const body=$('reading-body');
    if(event.key==='Home'||event.key==='End')body.scrollTo({top:event.key==='Home'?0:body.scrollHeight});
    else body.scrollBy({top:({'ArrowDown':60,'ArrowUp':-60,'PageUp':-body.clientHeight*.85}[event.key]??body.clientHeight*.85)});
    return;
  }
  if ([' ','ArrowRight','ArrowLeft','h','H','a','A'].includes(event.key)) event.preventDefault();
  if (event.repeat) return;
  if ([' ','ArrowRight'].includes(event.key)) move(1);
  if (event.key === 'ArrowLeft') { setAuto(false); move(-1); }
  if (event.key.toLowerCase() === 'h' || event.key === 'ArrowUp') { event.preventDefault(); backlog.open(); }
  if (event.key.toLowerCase() === 'a') setAuto(!reader.auto);
  if (event.key === 'ArrowDown' && !reader.intro) { event.preventDefault(); setDialogueHidden(true); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { rememberScroll();setAuto(false); save(true); readingClock.pause(); saveSessions(); }
  else void followOtherDevice();
});
window.addEventListener('focus',()=>void followOtherDevice());
const dialogueAvatar=createDialogueAvatar($('card')),standingStage=createStandingStage($('standing-portrait'));
// Wide screens stand up to three people, narrow ones two.
const narrowStage=matchMedia('(max-width:600px)');
// The variant a character or location shows at the reading position, unless variants are switched off.
function currentVariant(id) {
  return reader.story&&document.documentElement.dataset.variants!=='off'?variantAt(reader.story,id,reader.index):null;
}
/* Display preference: standing portraits first, avatar only, or none. Standing portraits show everyone on stage
 * in a scene; the speaker gets the square avatar instead when not standing (no portrait, kept off stage, a CG or
 * a close-up in view). */
function updateDialogueAvatar() {
  const story=reader.story,unit=story?.units[reader.index],display=document.documentElement.dataset.portraitDisplay;
  const active=display!=='none' && !$('reader').hidden && !reader.intro && !!unit;
  const visible=new Set(active?currentCast().map(c=>c.id):[]),bookId=story?.book.id;
  const standing=id=>{
    const look=characterImageSession.avatar(bookId,id,visible,currentVariant(id),{includeStanding:true});
    return look?.kind==='standing'?look:null;
  };
  const stage=active&&display==='standing'&&!backgroundPanel.cgVisible&&!backgroundPanel.cutInVisible
    ?stageAt(story,reader.index,{capacity:narrowStage.matches?2:3,canStand:id=>!!standing(id)}):{members:[],focus:null};
  standingStage.render(stage.members.map(id=>{
    const look=standing(id);
    return {id,image:look.image,crop:look.crop??null,flip:look.flip??DEFAULT_FLIP,
      stature:statureOf(story,id,currentVariant(id)),place:stage.places[id],focus:id===stage.focus,back:stage.offstage};
  }));
  const speaker=active&&['dialogue','thought'].includes(unit.kind)?unit.speakerId:null;
  const avatar=speaker&&!stage.members.includes(speaker)
    ?characterImageSession.avatar(bookId,speaker,visible,currentVariant(speaker),{includeStanding:false}):null;
  dialogueAvatar.render(avatar);
}
narrowStage.addEventListener('change',updateDialogueAvatar);
window.addEventListener('vn-appearance-change',()=>{
  updateDialogueAvatar();castPanel.refresh();
  if(reader.story&&!$('reader').hidden)void backgroundPanel.render();
});
const characterImageSession=createCharacterImageSession({onError:toast,onChange:()=>{updateDialogueAvatar();castPanel.refresh();}});
const extraPanel=createExtraPanel({onOpen:pauseForPanel,onClose:resumeAfterPanel,
  onChange:()=>{if(reader.story&&!$('reader').hidden)void backgroundPanel.render();}});
const backgroundPanel=createBackgroundPanel({onSceneChange:updateDialogueAvatar,getContext:()=>({story:reader.story,index:reader.index,intro:reader.intro}),getIllustration:(story,index)=>extraPanel.illustration(story,index,reader.bookComplete),toast});
// Shelf keys whose images are uploading; leaving the page would cut the upload off.
const uploading=new Set();
window.addEventListener('beforeunload',event=>{if(uploading.size){event.preventDefault();event.returnValue='';}});
const homePage=createHomePage({client:library,onOpen:book=>void openFromShelf(book),toast,coverOf:book=>shelf.coverSource(book)});
const shelf=createBookshelf({client:library,onOpen:book=>void openFromShelf(book),onBooks:homePage.show,toast,
  onRemoved:key=>{if(shelfKey===key)shelfKey=null;}});
const languageMenu=createLanguageMenu({onChange:setPlayerLanguage});
// Earlier versions kept books and images in this browser; the shelf holds them now.
for(const name of ['vn-reader-assets','vn-reader'])try{indexedDB.deleteDatabase(name);}catch{}
// Panels and long text show a line-and-dot scroll mark instead of the native scrollbar.
for(const node of document.querySelectorAll('#cast-body,#gallery-scroll,#reading-body,#backlog-scroll,#chapter-list,.reference-entries,.reference-detail,.settings-list'))attachScrollMark(node);
if(languageMenu.language!=='zh')setPlayerLanguage(languageMenu.language);
applySettings();
await refreshShelf();
