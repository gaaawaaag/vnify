// Shared by the synchronous head script and ES modules (including Node tests).
// A theme is a folder styles/themes/<id>/ holding theme.css and its own assets; see docs/theme-guide.md.
globalThis.VN_THEME_REGISTRY=Object.freeze([
  Object.freeze({id:'dark',label:'Dark',stylesheet:'styles/themes/dark/theme.css',sounds:'styles/themes/dark/sounds.json'}),
  Object.freeze({id:'folio',label:'缮本 Folio',stylesheet:'styles/themes/folio/theme.css',sounds:'styles/themes/folio/sounds.json',fixed:['dialogueTransparency']}),
  // dev: a validation theme for the theme tools; not offered in reading settings.
  Object.freeze({id:'proof',label:'验证主题',stylesheet:'styles/themes/proof/theme.css',icons:'styles/themes/proof/icons.svg',dev:true}),
  Object.freeze({id:'soda',label:'Soda',stylesheet:'styles/themes/soda/theme.css',icons:'styles/themes/soda/icons.svg',sounds:'styles/themes/soda/sounds.json',fixed:['dialogueTransparency']}),
]);
