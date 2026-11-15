# 主题制作指南

播放器支持通过内置主题自定义阅读界面的视觉风格。每个主题由独立的文件夹管理，通过覆盖 CSS 变量与可选装饰层配置配色、材质纹理、边框、字体与布局参数，由 `scripts/check-themes.mjs` 自动校验边界。

---

## 主题作用范围与结构

- **作用范围**：主题作用于**播放器**（阅读画面、菜单、历史记录、人物、词条、图集、附录、设置、悬停卡片）与**标题画面**；书架主页保持默认界面样式。
- **配置机制**：主题通过 CSS 自定义属性（变量）定义配色、材质、字体族、布局与外形参数以及装饰层贴图与九宫格边框，并可用一份 `icons.svg` 替换阅读界面的图标。若主题需要锁定某项外观设置（如固定对话框透明度 `"dialogueTransparency"`），可在主题注册项中声明 `fixed` 数组。
- **目录与文件结构**：

```text
styles/themes/my-theme/
  theme.css         主题样式表（必需）
  paper.webp        纹理贴图或边框图（支持 PNG / WebP / JPEG / SVG）
  frame.svg
  icons.svg         替换的图标（可选，见“主题图标”）
  fonts/title.woff2 主题字体（支持 WOFF2 / WOFF / TTF / OTF）
```

在 `src/reader/theme-registry.js` 中注册主题后即可在阅读设置中选用：

```js
Object.freeze({
  id: 'my-theme',
  label: '我的主题',
  stylesheet: 'styles/themes/my-theme/theme.css',
  icons: 'styles/themes/my-theme/icons.svg',   // 可选
  fixed: ['dialogueTransparency']              // 可选
}),
```

- `id` 使用小写英文字母、数字与连字符，与 `styles/themes/<id>/` 目录名一致。
- 尚在调试中的主题可附加 `dev: true`，在浏览器控制台通过 `VNTheme.setGlobal('my-theme')` 切换预览。
- 空白模板可参考 [docs/theme-template/theme.css](theme-template/theme.css)，完整演示主题见 `styles/themes/proof/`。

---

## `theme.css` 语法规范

`theme.css` 由三种规则块构成：

```css
@font-face {
  font-family: "my-theme-title";
  src: url(fonts/title.woff2) format("woff2");
}

:root[data-theme="my-theme"] {
  --gold: #c9a46a;
  --dialogue-layer: "";
  --dialogue-texture: url(paper.webp) center / 320px;
}

@media (max-width: 600px) {
  :root[data-theme="my-theme"] {
    --dialogue-padding: 20px;
  }
}
```

校验脚本 `scripts/check-themes.mjs` 对 `theme.css` 与主题目录执行以下检查：
- 规则块限于 `@font-face`、`:root[data-theme="<id>"]` 以及 `@media (max-width: 600px)` 内的 `:root[data-theme="<id>"]`，块内仅声明下方列出的可用 CSS 变量。
- `url()` 仅引用当前主题目录内的本地相对路径文件。
- `@font-face` 的 `font-family` 名称以 `<id>-` 开头，支持 `font-family`、`src`、`font-weight`、`font-style`、`font-display`、`font-stretch`、`unicode-range` 属性，所用字体须允许再分发。
- 体积上限：单个文件 ≤ `10 MB`，图片合计 ≤ `10 MB`，主题目录总计 ≤ `40 MB`。

---

## 可调 CSS 变量清单

`styles/tokens.css` 中声明的主题变量均可按需覆盖，未覆盖项自动沿用默认值：

| 类别 | 变量与说明 |
| --- | --- |
| 基础配色 | `--bg`（页面底色）、`--text`（正文色）、`--muted`（次要文字色）、`--gold` / `--accent`（强调色）、`--line`（分隔线）、`--focus`（焦点框）、`--panel`（实心面板底色）、`--hover`（悬停底色） |
| 场景底幕 | `--scrim-rgb`（底幕渐变色，格式为 `"R G B"` 三个数字）、`--dialogue-fade`（底幕顶边渐隐高度）、`--dialogue-text-shadow`（正文阴影）；`--dialogue-alpha` 由阅读设置的对话框透明度控制 |
| 面板与卡片材质 | `--surface-rgb`（`"R G B"` 三个数字）、`--glass`、`--blur`、`--card-radius`、`--card-highlight-rgb`、`--shadow`、`--shadow-rgb` |
| 回忆与梦境 | `--memory`、`--dream`（文字与标签色）、`--memory-scrim-rgb`、`--dream-scrim-rgb`（底幕染色）、`--memory-image-filter`、`--dream-image-filter`（画面 CSS `filter` 值）、`--memory-surface-rgb`、`--dream-surface-rgb`（阅读框材质色） |
| 场景状态栏 | 右上角常驻地点、时间、菜单与保存图标：`--context-text`（地点与菜单按钮）、`--context-muted`（时间与保存图标）、`--context-shadow` |
| 快捷操作 | `--quick-text`（名字行右侧的隐藏、历史、自动按钮颜色） |
| 人物名对比底色 | `--contrast-surface`、`--contrast-memory-surface`、`--contrast-dream-surface`、`--contrast-document-surface`（6 位十六进制实心色，填写对应阅读框的大致底色，供播放器自动校准人物名可读对比度） |
| 布局与立绘参数 | `--dialogue-max-width`（文字栏最大宽度）、`--dialogue-padding`、`--dialogue-bottom-space`（文字距屏幕底边距离）、`--dialogue-quick-top`、`--dialogue-quick-right`、`--dialogue-avatar-size`、`--dialogue-side-avatar-size`（宽屏文字栏左侧头像最大宽度）、`--standing-height`（立绘图高，默认 `min(100cqh, 175cqw)`，宽窄屏共用）、`--standing-hair`（立绘发顶位置，宽窄屏共用）、`--standing-band-top`（宽屏立绘下沉参照线）、`--standing-floor`（宽屏立绘底边基准线）、`--standing-left` / `--standing-right`（宽屏左右立绘中心位置）、`--standing-left-narrow` / `--standing-right-narrow`（窄屏左右立绘中心位置）、`--standing-back-brightness`（非说话人立绘亮度）、`--nameplate-padding`、`--nameplate-shift`（名字牌偏移，如 `0 -8px`） |
| 阅读框外形 | 默认没有框，文字直接压在底幕上。`--dialogue-box-alpha`（框底色不透明度，底色取 `--surface-rgb`，回忆／梦境时随之染色；`0` 为无底色）、`--dialogue-box-image`（叠在底色上的 `background-image`）、`--dialogue-box-border`、`--dialogue-box-radius`、`--dialogue-box-shadow`（可写错位硬阴影如 `5px 6px 0 #22305a`）、`--dialogue-box-inset`（框与屏幕边缘、底边的间距，窄屏上常用）、`--dialogue-sample-padding`（设置页样例文字在框内的内边距）。设置页样例使用同一外形 |
| 名牌外形 | `--nameplate-fill`（名牌底色）、`--nameplate-character-fill`（混入人物色的比例，如 `100%` 为整块人物色）、`--nameplate-text`（固定的名字颜色；不设时用人物色）、`--nameplate-text-shadow`、`--nameplate-border`、`--nameplate-radius`、`--nameplate-shadow`、`--nameplate-font-size`、`--nameplate-rotate`（倾斜角度） |
| 名字记号 | 名牌旁的一个小图形，默认是名字下方的短线。`--name-rule-width`（宽度，设为 `0` 时隐藏）、`--name-mark-height`、`--name-mark-inset`（相对名牌的位置，写法同 `inset`，默认 `auto auto -8px 0`）、`--name-mark-transform`、`--name-mark-background`（不设时用人物色，可写图片）、`--name-mark-border`、`--name-mark-radius`、`--name-mark-shadow`、`--name-mark-opacity`。可做成圆点、气泡尾巴等 |
| 快捷按钮 | 名字行右侧的隐藏、历史、自动：`--quick-button-width`、`--quick-button-height`、`--quick-button-gap`、`--quick-button-background`、`--quick-button-border`、`--quick-button-shadow`、`--quick-icon-size`、`--quick-icon-stroke`（线条图标的线宽），自动播放开启时的 `--quick-active-text`、`--quick-active-background`；圆角用 `--toolbar-button-radius` |
| 菜单按钮与菜单项 | 右上角菜单按钮：`--menu-button-size`、`--menu-button-background`、`--menu-button-open-background`（菜单展开时）、`--menu-button-border`、`--menu-button-shadow`、`--menu-button-filter`（收起时压在画面上的投影）。菜单项：`--menu-item-padding`、`--menu-item-font-size`、`--menu-item-align`，左侧小记号 `--menu-mark-size`、`--menu-mark-rotate`、`--menu-mark-radius`、`--menu-mark-border`、`--menu-mark-background`、`--menu-mark-rest-opacity`（未悬停时的不透明度，默认 `0`）。书名卡、章节列表与菜单项共用的描边：`--toolbar-button-shadow`、`--toolbar-button-hover-shadow` |
| 地点标签 | 右上角地点与时间默认没有底：`--place-padding`、`--place-background`、`--place-border`、`--place-radius`、`--place-shadow`，地点前的小记号 `--place-mark-display`（设为 `none` 隐藏）、`--place-mark-color` |
| 点击继续指示器 | `--continue-background`（句末记号的填充色或背景图）、`--continue-size`（记号边长，默认 `6px`）、`--continue-rotate`（记号转角，默认 `45deg` 即菱形；用图片时常设 `0deg`）、`--continue-dot`（自动播放时绕行圆点的颜色）、`--continue-line`（落点涟漪与绕行轨道线条颜色），同时作用于标题画面“点击开始”指示器 |
| 滚动指示条 | `--scroll-track`（细线轨道色）、`--scroll-mark`（当前位置圆点与已读段颜色） |
| 文档纸面（`document`） | `--document-bg`、`--document-text`、`--document-line`、`--document-muted`、`--document-action`、`--document-hover`、`--document-focus`、`--document-shadow`、`--document-radius` |
| 顶部菜单与书名卡 | `--toolbar-background`、`--toolbar-button-border`、`--toolbar-button-radius`、`--toolbar-button-texture` |
| 浮层与窗口 | `--window-texture`（设置、历史、悬停卡片等叠在 `--glass` 上的底纹）、`--window-frame`（`border-image` 值）、`--radius` |
| 人物面板（Cast） | `--cast-scrim`（全屏压暗层颜色或渐变）、`--cast-blur`（背景模糊半径） |
| 章节与场景扉页 | `--chapter-rule-background`（章节名下方装饰线）、`--scene-mark-color`（场景标题上方菱形符号颜色） |
| 名牌与状态标签布局 | `--speaker-row-direction`（默认 row，可设 column）、`--speaker-row-align`、`--speaker-row-gap`、`--speaker-row-margin`（行下间距）、`--speaker-layout-margin`（名牌下边距，可为负值以补偿视觉上移） |
| 侧位头像衬板 | `--side-portrait-bottom`（相对文字栏底边；initial 沿用屏幕贴底）、`--side-portrait-gap`（与文字栏间距，可为负）、`--side-portrait-panel-content`（设为双引号空串开启）、`--side-portrait-panel`（背景）、`--side-portrait-panel-shadow`（内框）；衬板从头像高度 22% 处向下铺满，位于图片背后 |
| 对话框头像 | `--portrait-backing`、`--portrait-shadow`、`--portrait-radius`；宽屏文字栏左侧的头像默认无框：`--side-portrait-backing`、`--side-portrait-shadow`、`--side-portrait-radius`；窄屏头像默认无框：`--narrow-portrait-mask`（遮罩，默认 `none`）、`--narrow-portrait-backing`、`--narrow-portrait-shadow`、`--narrow-portrait-radius`、`--narrow-portrait-left`、`--narrow-portrait-top`、`--narrow-portrait-layer`（设为 `-1` 时头像在阅读框之下，有底色的框压住重叠部分）、`--narrow-portrait-text-left`（显示头像时正文的左内边距）；显示窄屏头像时的名字行：`--narrow-name-left`（名字起点）、`--narrow-name-mark-inset`、`--narrow-name-mark-width`（名字记号的位置与宽度，不设时同其他情况）、`--narrow-speaker-row-align`、`--narrow-speaker-row-height`、`--narrow-speaker-row-lift`（名字行的对齐、高度与底部留空；高度固定且底部对齐时，折行的长名字向上长，名字记号位置不变） |
| 特写插图（Cut-in） | `--cut-in-border`、`--cut-in-shadow`、`--cut-in-radius` |
| 标题画面 | `--title-screen-text`、`--title-screen-hint`、`--title-screen-scrim`、`--title-screen-shadow` |
| 鼠标指针 | `--cursor-default`、`--cursor-pointer`、`--cursor-help`（如 `url(cursor.png) 3 3, default`） |

### 主题字体变量

### 阅读框贴图与状态暗角

`--dialogue-box-frame` 为阅读框和设置样例的 `border-image` 值，例如 `url(frame.png) 150 / 38px / 0 stretch`。
边框建议使用透明 PNG／WebP：只保留线条与角花，让框内纸纹与状态渐变连续显示。

回忆与梦境可以分别设置 `--memory-dialogue-box-image`／`--dream-dialogue-box-image`（`background-image`），
以及 `--memory-dialogue-box-shadow`／`--dream-dialogue-box-shadow`（`box-shadow`，可用 `inset` 做深色边缘渐变）。
这些变量不设置时沿用普通阅读框的贴图和阴影；只影响阅读框，不改变文字、姓名或人物图的颜色。
文档纸面仍使用独立的纸面变量。暗角中间应留足浅色阅读区域，并相应设置人物色对比底色。
信笺纸面的贴图与九宫格框分别用 `--document-image`（`background-image`）和 `--document-border-image`（`border-image`），
直接绘制在纸面上，不受装饰层与不透明底色的叠放影响；默认均为 `none`，诗歌面板不使用它们。

### 主题字体变量

主题通过以下三个变量配置字体族列表（可引用同文件内声明的 `@font-face`）：
- `--theme-ui-font`：界面控件与面板字体
- `--theme-title-font`：书名、章节扉页与场景标题字体
- `--theme-reading-font`：正文与人物档案字体

英文作品（`@book lang=en`）打开时页面语言为 `en`，改用另一组变量：`--theme-ui-font-en`、`--theme-title-font-en`、`--theme-reading-font-en`，含义同上；不设时界面用 Inter，书名、标题与正文用 Crimson Pro。日文作品（`@book lang=ja`）打开时页面语言为 `ja`，对应 `--theme-ui-font-ja`、`--theme-title-font-ja`、`--theme-reading-font-ja`；不设时界面用 Noto Sans JP，书名、标题与正文用 Noto Serif JP（没有时用本机明朝体）。繁体中文作品（`@book lang=zh-Hant`）打开时页面语言为 `zh-Hant`，对应 `--theme-ui-font-hant`、`--theme-title-font-hant`、`--theme-reading-font-hant`；不设时界面用 Noto Sans TC，书名、标题与正文用 Noto Serif TC。

基础字体链变量 `--ui-font`、`--title-font`、`--reading-font` 保留给系统级字体调度，由播放器将用户本机字体与上述主题字体变量组合生效。

---

## 装饰层（Decoration Layers）

装饰层用于在特定界面元素上叠加独立的纹理贴图或九宫格边框（`border-image`）。通过将对应槽位的 `-layer` 变量设为空字符串 `""` 即可启用该装饰层：

| 装饰层变量模式 | 作用 |
| --- | --- |
| `--<槽>-layer` | 设为 `""` 启用该装饰层 |
| `--<槽>-texture` | CSS `background` 值，如 `url(paper.webp) center / 320px repeat` |
| `--<槽>-frame` | CSS `border-image` 九宫格边框值，如 `url(frame.svg) 24 / 24px / 6px round` |
| `--<槽>-outset` | 装饰层向元素外扩的尺寸（如 `6px`，负值表示内缩） |

支持的装饰层槽位（`<槽>`）：

| 槽位名 | 对应界面元素 | 叠放层级 |
| --- | --- | --- |
| `dialogue` | 对白与旁白底幕区域 | 位于底色之上、正文文字之下 |
| `nameplate` | 说话人名字牌 | 位于名字文字之下（可配合 `--nameplate-padding` 留出边距） |
| `document` | `@document` 纸面面板 | 位于纸面底色之上、文字之下 |
| `toolbar` | 菜单展开后的书名卡、章节与菜单按钮 | 位于按钮底色之上、文字之下 |
| `chapter` | 章节扉页（全屏） | 位于场景背景之上、扉页文字之下 |
| `scene` | 场景标题过场（全屏） | 位于场景背景之上、标题文字之下 |
| `portrait` | 对话框头像 | 位于头像图片之上，可用于添加相框装饰 |
| `title` | 作品标题画面 | 位于封面图之上、书名文字之下，可用于添加画框装饰 |

---

## 主题图标

阅读界面的图标来自页面里的一张图标表。主题可在注册项中用 `icons` 指向主题文件夹内的一份 SVG，里面每个 `<symbol>` 的 `id` 对应一个要替换的图标；主题生效时替换，切换到其他主题时恢复默认，没有提供的图标照用默认。

| id | 图标 |
| --- | --- |
| `i-hide` | 隐藏对话框 |
| `i-history` | 历史 |
| `i-auto` | 自动播放 |
| `i-menu` | 右上角菜单按钮 |
| `i-next` | `document` 纸面的继续按钮 |
| `i-close` | 面板与窗口的关闭 |
| `i-back` | 返回 |

```svg
<svg xmlns="http://www.w3.org/2000/svg">
  <!-- 线条图标：不写颜色时跟随按钮文字色，线宽由样式决定 -->
  <symbol id="i-auto" viewBox="0 0 24 24"><path d="M9 7.5v9l7.5-4.5z"/></symbol>
  <!-- 图片图标：引用主题文件夹内的图片 -->
  <symbol id="i-menu" viewBox="0 0 24 24"><image href="menu.png" width="24" height="24"/></symbol>
</svg>
```

- 只保留绘图元素（`path`、`circle`、`rect`、`g`、`image`、渐变等）；脚本、`style`、`foreignObject`、事件属性和指向主题文件夹以外的链接会被去掉，检查脚本也会报错。
- 线条图标沿用按钮的描边样式（`fill: none`、`stroke: currentColor`），需要实心时在图形上写 `fill="currentColor"`；彩色图标直接写颜色或用 `<image>` 引用 PNG／WebP／SVG。
- 图标大小由按钮样式决定（快捷按钮见 `--quick-icon-size`）。

## 校验与多状态截图

编写或修改主题后，可使用内置脚本校验语法边界并生成全状态预览图：

```bash
# 校验主题 CSS 规则、变量名、文件路径与体积限制
node scripts/check-themes.mjs my-theme

# 自动渲染桌面与窄屏下的全部阅读状态并生成对比页（需先执行 npm install）
node scripts/theme-shots.mjs my-theme
```

截图输出至 `theme-shots/<id>/index.html`，涵盖标题画面、对白、心声、回忆／梦境、章节与场景扉页、两种 `document`、原书注解、特写插图、立绘与头像、人物面板、设置、历史记录及悬停卡片。

示例作品没有背景图和立绘。要在真实画面上看主题，可以指定书架上的一本书（书架数据目录下 `library/<作品ID>` 文件夹）。脚本会复制一份到临时书架再截图，不改动原书架和阅读进度：

```bash
# 截标题画面、指定句数处的阅读画面，以及菜单、人物、图集、设置、历史
node scripts/theme-shots.mjs my-theme --book <书架目录>/library/<作品ID> --steps 0,3,40,50
```

---

## 交给 AI 做主题

可以把本文、模板和一张参考截图交给 AI，并说明：

- 交付一个 `styles/themes/<id>/` 文件夹，`theme.css` 只按本文写法设置变量；图片用 PNG／WebP／SVG，边框图按九宫格设计（四角不拉伸，边可重复）。
- 保持文字可读：阅读框底色与正文对比足够，回忆／梦境仍可区分。
- 交付后运行检查脚本与截图脚本，按截图修改。
