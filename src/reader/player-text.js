// @ts-check
/* The player's interface follows the open work's language. Chinese is written in place (HTML and code); other
 * languages look each Chinese text up here (Japanese in player-text-ja.js, Traditional Chinese in player-text-hant.js).
 * Placeholders in braces ({n}) are filled by t(). On the shelf the language is the one chosen in its globe menu
 * (src/ui/shelf-language.js). */

import {JA} from './player-text-ja.js';
import {HANT} from './player-text-hant.js';

/** @type {Record<string,Record<string,string>>} */
const TEXT={ja:JA,'zh-Hant':HANT,en:{
  // Shelf and home page
  '界面语言':'Language','书架设置':'Shelf settings','上传图片…':'Upload picture…','上传的图片':'Uploaded picture',
  '最近阅读的封面':'Cover of the last book read','默认照片':'Default photo','亮度':'Brightness','书架':'Shelf','书架视图':'Shelf view',
  '竖版封面':'Tall covers','横版封面':'Wide covers','列表':'List','试读示例':'Try a sample','导入作品':'Import a work',
  '书架分页':'Shelf pages','上一页':'Previous page','下一页':'Next page','点击 · 空格推进 · ← 回退':'Click · Space to continue · ← to go back',
  '继续阅读':'Continue reading','继续阅读《{title}》，已读 {n}%':'Continue reading “{title}”, {n}% read','背景图片无法读取。':'The background picture cannot be read.',
  '未读':'Unread','读完':'Finished','今天':'Today','昨天':'Yesterday','{n} 天前':'{n} days ago','制作中':'In progress',
  '上传中 {a}/{b}':'Uploading {a}/{b}','{title}：更多操作':'{title}: more actions','导出作品包':'Export package','移出书架':'Remove from shelf',
  '移出':'Remove','编辑信息':'Edit details','评分与短评':'Rating & review','{m} 月 {d} 日':'{m}/{d}','{m} 月 {d} 日读完':'Finished {m}/{d}','重新阅读':'Read again','回看结尾':'See the ending','简介':'Blurb',
  '阅读统计':'Reading stats','年份':'Year','书架上显示评分':'Show ratings on the shelf','少':'Less','多':'More','每天':'By day','每本书':'By book','全部':'All','最长连续':'Longest streak','{n} 本':'{n}','已移出的书':'Removed book','《{title}》':'“{title}”','读取中':'Loading',
  '书架不可用：本机服务未能读取作品库。':'The shelf is unavailable: the local service could not read the library.',
  '简体中文':'Simplified Chinese','繁体中文':'Traditional Chinese','英文':'English','日文':'Japanese','横屏优先':'Landscape','竖屏优先':'Portrait',
  '关闭':'Close','每页行数':'Rows per page','2 行':'2 rows','3 行':'3 rows','4 行':'4 rows','6 行':'6 rows','不分页':'One page',
  '优先使用原书封面':'Prefer the original book cover','取消':'Cancel','编辑作品信息':'Edit work details','书名':'Title','作者':'Author',
  '保存':'Save','替换书架上的作品':'Replace the work on the shelf','替换':'Replace','作品未能放上书架：{m}':'The work could not be put on the shelf: {m}',
  '作品包或正文':'Package or script','作品文件夹':'Work folder',
  // Reading screen
  '章节':'Chapters','本章阅读进度':'Chapter progress','菜单':'Menu','阅读菜单':'Reading menu',
  '人物':'Characters','词条':'Glossary','图集':'Gallery','附录':'Appendix','设置':'Settings','主页':'Home',
  '阅读区域，空格或右方向键推进':'Reading area. Press Space or → to continue','资料阅读区域，右方向键继续':'Document. Press → to continue',
  '细节特写':'Close-up','放大细节特写':'Enlarge close-up','放大':'Enlarge','收起细节特写':'Collapse close-up','收起':'Collapse',
  '展开细节特写':'Expand close-up','展开':'Expand',
  '心声':'Thought','回忆':'Memory','梦境':'Dream','资料':'Document',
  '隐藏对话框':'Hide text box','隐藏对话框（↓）':'Hide text box (↓)','历史':'History','历史（H）':'History (H)','朗读（V）':'Read aloud (V)',
  '自动播放':'Auto','自动播放（A）':'Auto (A)','继续':'Continue','阅读历史':'Reading history','返回':'Back',
  '保存中…':'Saving…','进度已保存':'Progress saved','未能保存':'Not saved','作品已更新':'Updated',
  '书架存储不可用，当前仍可试读；关闭后进度可能丢失。':'Shelf storage is unavailable. You can keep reading, but your place may be lost when you close the page.',
  '这本作品已在别处更新，回到书架重新打开即可读新版本。':'This work was updated elsewhere. Reopen it from the shelf to read the new version.',
  '已跳到其他设备上的阅读位置。':'Moved to where you were reading on another device.',
  '本篇已读完。可回看历史。':'The end. You can still look back through the history.',
  '本章已读完，后续章节尚未就绪。':'End of chapter. The next chapters are not ready yet.',
  ' 本篇完 · 可回看历史':' The end · History is still open',' 本章完 · 等待后续章节':' End of chapter · More to come',
  '人物资料更新 · {n} 人':'Character updates · {n}','新增人物':'New character','人物条目更新':'Character entry updated','人物资料更新':'Character updated',
  '作品的背景清单无法使用，请重新导入作品包。':'This work’s background list cannot be used. Import the package again.',
  // Title screen
  '标题画面':'Title screen','点击开始':'Click to start',
  '结尾画面':'End screen','终':'The End','结尾':'Ending','阅读时长':'Reading time','日期':'Dates','阅读天数':'Days read','{h} 小时 {m} 分':'{h} h {m} min','{m} 分钟':'{m} min','{n} 天':'{n} days','评分':'Rating','{n} 分':'{n} of 5','短评':'Review','写几句短评…':'A few words…','回看':'Look back','回到书架':'Back to shelf','未能保存评分':'Rating not saved',
  // Gallery
  '显示全部':'Show all','关闭图集':'Close gallery','图集分类':'Gallery categories','图片':'Pictures','这部作品还没有图片。':'This work has no pictures yet.',
  '查看图片':'Picture viewer','关闭图片':'Close picture','上一张':'Previous','下一张':'Next',
  '未读到的图片，点击显示':'Not reached yet. Click to show','已读到 {a} / {b}':'Seen {a} / {b}',
  '封面':'Cover','氛围背景':'Ambience','地点':'Places','地点差分':'Place variants','特写':'Close-ups','原书图片':'Original images',
  '作品背景':'Backgrounds','特写 {n}':'Close-up {n}','原书封面':'Original cover','插图 {n}':'Illustration {n}',
  // Cast
  '演员表':'Cast','关闭人物资料':'Close characters','人物资料':'Character','故事尚未介绍人物。':'No characters have been introduced yet.',
  '其他人物':'Others','全名 · {name}':'Full name · {name}','称呼':'Names','关系':'Relations','背景':'Background','外观参考':'Appearance',
  // Glossary and appendix
  '关闭词条':'Close glossary','查找词条':'Search glossary','关闭附录':'Close appendix','没有找到':'No matches',
  '还没有遇到词条。':'No glossary entries yet.','已遇到 {n}':'{n} found','又作 {names}':'Also {names}','首次出现':'First appears',
  // Settings
  '关闭设置':'Close settings','分屏方式':'Screens','逐句分屏':'One sentence each','按原文自然段':'By paragraph','主题':'Theme',
  '对话框高度':'Text box height','对话框透明度':'Text box transparency','字号':'Font size','行距':'Line spacing','文字显示':'Text speed',
  '立即显示':'Instant','快速':'Fast','适中':'Medium','缓慢':'Slow','自动播放停留':'Auto-advance delay','{n} 行':'{n} lines','{n} 秒':'{n} s','（{text}）':'({text})',
  '总音量':'Master volume','音乐音量':'Music volume',
  '模型':'Model','音色':'Voices','音色 ID 或链接':'Voice ID or link','添加':'Add','浏览器':'Browser','移除':'Remove','音色 ID 无效。':'Invalid voice ID.','Fish Audio 上没有这个音色。':'Fish Audio has no such voice.','朗读失败：{m}':'Could not read the line aloud: {m}',
  '作品分派：{name}':'From the work: {name}','试听':'Preview','这部作品用了 {services} 音色，填入 key 后才能听到':'This work uses {services} voices; add a key to hear them',
  '环境音音量':'Ambience volume','音效音量':'Effects volume','界面音效音量':'Interface sounds volume',
  '致谢':'Credits','关闭致谢':'Close credits','原作':'Original','说明':'Notice','图像':'Images','音乐':'Music','音效':'Sound effects','语音':'Voices','制作':'Made with','链接':'Link',
  '朗读':'Read aloud','台词':'Dialogue','台词与旁白':'Dialogue and narration','语音音量':'Voice volume','语速':'Voice speed','旁白':'Narrator','默认':'Default',
}};

/* Typing pace: an English word takes about as many characters as a Chinese phrase takes, so English types two characters
 * in the time of one, and a reader takes in about twenty English characters a second against eight Chinese ones.
 * Japanese spells much of a sentence out in kana, so it types and reads a little faster than Chinese. */
/** @type {Record<string,{typing:number,perSecond:number}>} */
const PACE={zh:{typing:1,perSecond:8},'zh-Hant':{typing:1,perSecond:8},en:{typing:.5,perSecond:20},ja:{typing:.8,perSecond:10}};
/** Milliseconds between typed characters for the chosen speed. @param {number} speed */
export const typingInterval=speed=>speed*PACE[current].typing;
/** Milliseconds a reader needs for a line of this many characters. @param {number} characters */
export const readingMs=characters=>characters/PACE[current].perSecond*1000;

/** Separators between listed names. @type {Record<string,string>} */
const LIST={zh:'、','zh-Hant':'、',en:', ',ja:'、'};

let current='zh';

/** @param {string} lang */
export function setTextLanguage(lang) { current=Object.hasOwn(TEXT,lang)?lang:'zh'; }
export const textLanguage=()=>current;

/** The interface text in the open work's language. @param {string} text @param {Record<string,string|number>} [values] */
export function t(text,values={}) {
  const found=TEXT[current]?.[text]??text;
  return found.replace(/\{(\w+)\}/g,(m,key)=>Object.hasOwn(values,key)?String(values[key]):m);
}

/** Names joined in the open work's language. @param {string[]} names */
export const listText=names=>names.join(LIST[current]);

const ATTRIBUTES=['aria-label','title','data-tip','placeholder','alt'];
/** @type {WeakMap<Node,Map<string,string>>} Chinese text of each node this module translated, by attribute ('' = text). */
const originals=new WeakMap();

/**
 * Translate the fixed interface text under the given roots, or put the Chinese back. Text a node has since been given
 * by code is left alone.
 * @param {Element[]} roots
 */
export function translateInterface(roots) {
  for(const root of roots) {
    // Elements marked translate="no" (the language names in the globe menu) keep their text.
    const filter=(/** @type {Node} */ node)=>node.nodeType===1&&/** @type {Element} */(node).getAttribute('translate')==='no'?2:1;
    const walker=root.ownerDocument.createTreeWalker(root,4|1,filter);
    for(let node=/** @type {Node|null} */(root);node;node=walker.nextNode()) {
      const saved=originals.get(node)??new Map();
      // The Chinese key of a value, unless code has since replaced the value with something else.
      const keyOf=(/** @type {string} */ slot,/** @type {string} */ value)=>{
        const key=saved.get(slot)??value;
        return key in TEXT.en&&(value===key||Object.values(TEXT).some(table=>table[key]===value))?key:null;
      };
      if(node.nodeType===3) {
        const text=/** @type {Text} */(node),value=text.data.trim(),key=value&&keyOf('',value);
        if(!key)continue;
        saved.set('',key);originals.set(node,saved);
        text.data=text.data.replace(value,t(key));
        continue;
      }
      const element=/** @type {Element} */(node);
      for(const name of ATTRIBUTES) {
        const value=element.getAttribute(name),key=value!==null&&keyOf(name,value);
        if(!key)continue;
        saved.set(name,key);originals.set(node,saved);
        element.setAttribute(name,t(key));
      }
    }
  }
}

/** Every interface text a language table translates, as its Chinese original. */
export const interfaceTexts=()=>Object.keys(TEXT.en);
