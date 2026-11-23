// Computed-style snapshot of the player, for refactors that must not change the look.
// Run in a visible tab on the home page:
//   await (0, eval)(await (await fetch('/scripts/browser/style-snapshot.js')).text())({save: 'before'})
//   ...change CSS, reload...
//   await (0, eval)(await (await fetch('/scripts/browser/style-snapshot.js')).text())({compare: 'before'})
// It replaces the reader's current book in this browser profile and uses only original examples.
// Without a visible tab, run it through scripts/browser/browser-run.mjs with {returnSnapshot:true}
// and compare the files with scripts/browser/compare-snapshots.mjs.
async ({save = null, compare = null, examples = null, returnSnapshot = false, shots = []} = {}) => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const $ = id => document.getElementById(id);
  const until = async (test, ms = 5000) => { for (let t = 0; t < ms && !test(); t += 50) await wait(50); return test(); };
  const press = key => document.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}));
  const {exportStoryPackage} = await import('/src/reader/story-package.js');
  const {emptyBackgrounds, imageId} = await import('/src/reader/backgrounds.js');
  const {emptyCharacterImages} = await import('/src/reader/character-images.js');
  const PROPS = ['display','position','top','right','bottom','left','width','height','margin-top','margin-right','margin-bottom','margin-left',
    'padding-top','padding-right','padding-bottom','padding-left','color','background-color','background-image','background-size','background-position',
    'background-repeat','border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-style','border-top-color',
    'border-right-color','border-bottom-color','border-left-color','border-top-left-radius','border-top-right-radius','border-bottom-right-radius',
    'border-bottom-left-radius','border-image-source','border-image-slice','border-image-width','box-shadow','backdrop-filter','filter','opacity',
    'font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-decoration-line','text-decoration-style',
    'text-decoration-color','text-decoration-thickness','text-underline-offset','text-shadow','transform','mask-image','cursor','outline-style',
    'outline-color','z-index','visibility','content','object-fit','max-width','max-height','min-height','gap','justify-content','align-items'];
  const roots = () => [$('reader'), $('title-screen'), $('character-hover'), $('toast'), ...document.querySelectorAll('dialog[open]')].filter(Boolean);
  const name = node => node.id ? `#${node.id}` : `${node.tagName.toLowerCase()}${node.classList.length ? '.' + [...node.classList].sort().join('.') : ''}`;
  function path(node) {
    const parts = [];
    for (let n = node; n && n !== document.body; n = n.parentElement) {
      if (n.id) { parts.unshift(`#${n.id}`); break; }
      const same = [...(n.parentElement?.children ?? [])].filter(c => name(c) === name(n));
      parts.unshift(name(n) + (same.length > 1 ? `:${same.indexOf(n)}` : ''));
    }
    return parts.join('>');
  }
  function capture() {
    // Looping animations (the continue hint) are frozen at frame 0 so two runs compare equal.
    const looping = document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations === Infinity);
    for (const a of looping) { a.pause(); a.currentTime = 0; }
    // Fades and the auto-hiding toolbar run on timers; capture their settled, visible state.
    for (const a of document.getAnimations()) if (!looping.includes(a)) try { a.finish(); } catch {}
    $('reader').classList.remove('chrome-hidden');
    for (const a of document.getAnimations()) if (!looping.includes(a)) try { a.finish(); } catch {}
    const out = {};
    for (const root of roots()) for (const node of [root, ...root.querySelectorAll('*')]) {
      if (!node.getClientRects().length) continue;
      const key = path(node);
      for (const pseudo of ['', '::before', '::after']) {
        const style = getComputedStyle(node, pseudo || null);
        if (pseudo && (style.content === 'none' || style.content === 'normal')) continue;
        const values = PROPS.map(p => style.getPropertyValue(p));
        if (!pseudo) { const r = node.getBoundingClientRect(); values.push([r.x, r.y, r.width, r.height].map(Math.round).join(',')); }
        out[key + pseudo] = values.join('|').replaceAll(location.origin, '');
      }
    }
    for (const a of looping) a.play();
    return out;
  }
  async function solidImage(color, width, height) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return {id: await imageId(blob), image: {blob, type: 'image/png', width, height, name: `${color}.png`}};
  }
  async function open(file, bind, bust) {
    const raw = await (await fetch(`/examples/${file}`)).text(), bookId = /@book\s+(\S+)/.exec(raw)[1];
    const data = emptyBackgrounds(bookId), characterImages = emptyCharacterImages(bookId);
    if (bind) { const {id, image} = await solidImage('#c33', 600, 400); data.images[id] = image; bind(data.bindings, id); }
    if (bust) { const {id, image} = await solidImage('#36c', 400, 600); characterImages.images[id] = image; characterImages.bindings[bust] = {standing: {imageId: id}}; }
    const transfer = new DataTransfer();
    transfer.items.add(new File([await exportStoryPackage(raw, data, {characterImages})], 'snapshot.vn.zip'));
    $('reader').hidden = true; $('file').files = transfer.files; $('file').dispatchEvent(new Event('change', {bubbles: true}));
    await until(() => !$('title-screen').hidden, 3000); await wait(1500);
    await record(`${file}#title`, capture());
    for (let i = 0; i < 10 && !$('title-screen').hidden; i++) { $('title-screen').click(); await wait(400); }
    // Re-imports resume saved progress; rewind to the first unit.
    for (let i = 0; i < 60; i++) { press('ArrowLeft'); await wait(20); }
    await wait(1200);
  }
  const states = [];
  // With browser-run's shotsDir, listed states are also saved as screenshots (scripts/theme-shots.mjs).
  const record = async (name, value) => {
    states.push([name, value]);
    if (!shots.includes(name)) return;
    window.__vnShotRequest = name; await until(() => window.__vnShotDone === name, 15000);
  };
  const runs = examples ?? [
    ['rainy-visit.vn.txt', 14], ['dream-memory.vn.txt', 10], ['pages.vn.txt', 8], ['documents.vn.txt', 8],
    ['annotations.vn.txt', 4], ['grouped-cast.vn.txt', 4], ['cut-in.vn.txt', 6, (b, id) => { b.cutIns['brass-key'] = id; }],
    ['standing-portraits.vn.txt', 4, null, 'lin'],
  ];
  document.documentElement.dataset.snapshot = '1';
  for (const [file, steps, bind, bust] of runs) {
    await open(file, bind, bust);
    for (let step = 0; step < steps; step++) {
      await record(`${file}#${step}`, capture());
      // A standing portrait also supplies the avatar; capture that display mode on the same screen.
      if (bust) {
        const root = document.documentElement, mode = root.dataset.portraitDisplay, refresh = () => window.dispatchEvent(new Event('vn-appearance-change'));
        root.dataset.portraitDisplay = 'avatar'; refresh(); await wait(300); await record(`${file}#${step}:avatar`, capture());
        root.dataset.portraitDisplay = mode; refresh(); await wait(300);
      }
      press('ArrowRight'); await wait(1300);
    }
  }
  // Player windows and the hover card, opened on the current book.
  for (const [label, action] of [['cast', () => $('open-cast').click()], ['settings', () => $('reader-settings').click()],
    ['history', () => $('history').click()], ['contents', () => $('open-contents').click()]]) {
    action(); await wait(600); await record(`window:${label}`, capture());
    document.querySelectorAll('dialog[open]').forEach(d => d.close()); await wait(300);
  }
  const person = document.querySelector('#text .character-mention, #speaker');
  if (person) { person.dispatchEvent(new PointerEvent('pointerover', {bubbles: true, pointerType: 'mouse'})); await wait(400); await record('hover', capture()); }
  delete document.documentElement.dataset.snapshot;
  const snapshot = Object.fromEntries(states);
  if (returnSnapshot) return {summary: {states: states.length}, props: [...PROPS, 'rect'], snapshot};
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('vn-style-snapshots', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const store = (mode, run) => new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', mode), request = run(tx.objectStore('snapshots'));
    tx.oncomplete = () => resolve(request.result); tx.onerror = () => reject(tx.error);
  });
  if (save) await store('readwrite', s => s.put(snapshot, save));
  const summary = {states: states.length, elements: states.reduce((n, [, s]) => n + Object.keys(s).length, 0)};
  if (!compare) return summary;
  const before = await store('readonly', s => s.get(compare));
  if (!before) return {...summary, error: `no snapshot named ${compare}`};
  const differences = [];
  for (const state of new Set([...Object.keys(before), ...Object.keys(snapshot)])) {
    const a = before[state] ?? {}, b = snapshot[state] ?? {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[key] === b[key]) continue;
      const left = a[key]?.split('|') ?? [], right = b[key]?.split('|') ?? [];
      const props = [...PROPS, 'rect'].filter((p, i) => left[i] !== right[i]).map(p => {
        const i = [...PROPS, 'rect'].indexOf(p); return `${p}: ${left[i] ?? '∅'} → ${right[i] ?? '∅'}`;
      });
      differences.push(`${state} ${key}: ${props.join('; ')}`);
    }
  }
  return {...summary, differences: differences.length, sample: differences.slice(0, 40)};
}
