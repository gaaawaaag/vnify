<h1 align="center">vnify.</h1>

<p align="center">把文本改编成带背景、立绘、配乐与演出的视觉小说，在本地或个人云端书架阅读。</p>

<p align="center">
  <img src="docs/screenshots/reading.webp" alt="场景与旁白" width="24%">
  <img src="docs/screenshots/cut-in.webp" alt="特写插图" width="24%">
  <img src="docs/screenshots/memory.webp" alt="回忆场景（缮本 Folio 主题）" width="24%">
  <img src="docs/screenshots/palace.webp" alt="人物立绘与对白（缮本 Folio 主题）" width="24%">
</p>
<p align="center"><sub>示例：鲁迅《铸剑》，由 Agent 转换并完整配图，手机竖屏阅读。左起：场景旁白、特写插图、回忆、人物对白。</sub></p>

---

**vnify.** 将文本（TXT、EPUB）转化为带演出效果的线性视觉小说脚本（`.vn.txt`），结合背景、人物立绘、CG 与特写插图，生成可独立分享的作品包（`.vn.zip`），并在本地或个人云端书架中提供沉浸式阅读体验。

小说拥有绵密的叙述与心理描写，而视觉小说擅长用画面、立绘调度与分屏节奏营造临场感。vnify. 连接这两种媒介：在完整保留原著文脉与信息揭示顺序的前提下，通过 AI Agent 辅助完成剧本改编、人物档案整理与分镜导演，配合本地资产管理器完成配图与打包。

---

## 核心功能

### 舞台化阅读体验
- **忠实原著的改编幅度**：保留原书的事件因果、修辞与叙述视角。提供三种改编风格——默认“精修”在利用人物标签明确对白归属的同时，将冗余的“某某说道”精简或转化为伴随动作与神态描写；“精修＋删除语气描述”进一步完全隐去说话方式相关的修饰语，仅保留动作与情节陈述；“原文”逐句照录原文、不改写对白的呈现形式，适合对话很少的作品与非小说文本，人物、词条与配图可按需制作。
- **对白、心声与人物提及**：独立呈现人物对白与内心独白；第一人称叙述者的心理活动通常自然融入旁白，第三人称明确的心理语言可转为心声。正文中人物称呼染色，悬停显示无剧透简单信息卡片，帮助读者记忆。
- **三种正文承载形式**：将小说组织为具体场景（`scene`）、跨时空叙述（`narration`）与独立文档（`document`）。场景与叙述采用底幕逐句或按自然段推进；信件、公文、报刊以独立纸面排版呈现，题记与诗歌居中渐显。
- **立绘调度与演出**：支持多人同屏立绘、说话人高亮、全书统一缩放与柔和上下场排布，支持人物与地点的状态差分（衣着、年龄、昼夜、天气等）、全屏事件 CG、行间特写插图，以及换章擦除、换地点溶解、回忆柔焦与梦境起雾等分情境转场。
- **音乐、环境音、音效与朗读**：支持随阅读位置切换的无缝循环背景音乐（自动响度均衡）、按地点与内容块循环的环境音、顺读触发的句间音效，以及随主题变化的轻量界面音效；支持浏览器原生语音与 Fish Audio、ElevenLabs、Gemini TTS 三家云端朗读（API key 仅存于读者浏览器，按作品音色分派朗读）。
- **多语言支持**：目前支持简体中文、繁体中文、英文与日文作品（日文不显示振假名）。制作工具按作品语言分句与识别对白，播放器随作品语言切换界面文字与字体，书架界面可选语言。
- **原书内容保留与致谢**：自动提取并保留 EPUB 原书插图、封面及序言、后记、人物表等附录文本，原书插图可在对应正文段落随行展示；阅读菜单与结尾画面均提供“致谢”面板，清晰列出原作、图像模型、音频作者及许可证与语音音色。

### 随进度解锁的资料与词条
- **防剧透人物档案**：人物姓名、简介、关系与详情条目随阅读位置逐步解锁，向前回退进度时自动还原至当时的认知状态。
- **行内注解与世界词条**：支持原书注释与作品专属名词释义的悬停查看，阅读菜单内提供已解锁词条的检索面板与防剧透雾化图集。

<p align="center">
  <img src="docs/screenshots/cast.webp" alt="演员表" width="24%">
  <img src="docs/screenshots/terms.webp" alt="世界词条" width="24%">
  <img src="docs/screenshots/settings.webp" alt="阅读设置" width="24%">
  <img src="docs/screenshots/shelf.webp" alt="书架" width="24%">
</p>
<p align="center"><sub>演员表、世界词条、阅读设置与书架。</sub></p>

### AI 辅助改编与导演规划
- **确定性工具与 Agent 协同**：命令行工具负责原文行号映射、EPUB 解析、分批组装与严格语法校验；Agent 负责文本分镜改写、人物与词条提炼、全书美术风格设计及各章配图规划。
- **逐句来源可追溯**：每个文本单元均绑定原书段落编号，校验工具自动核对编号覆盖范围与引用完整性。

### 本地资产管理器
- **可视化资产与提示词管理**：在浏览器中按分类浏览全书封面与可选结尾图、氛围图、地点背景、人物立绘、CG、特写、差分以及声音、音效与音乐，调整立绘头像裁切框与镜像朝向，直接修改导演画面描述、生图提示词与致谢信息，重新生成或上传替换资产。
- **生成与搜索工作流**：图像支持连接 NovelAI、本地或云端 ComfyUI（自动识别 API 工作流节点）、OpenAI 兼容接口以及 Pexels / Pixabay 图库搜索；语音支持 Fish Audio、ElevenLabs（含 Voice Library）与 Gemini TTS 官方音色库；音乐与音效支持 ElevenLabs、ComfyUI（如 ACE-Step）、Lyria（Gemini API）、Freesound 与本地音频库（下载与生成的音效自动沉淀到本地库复用），成品一键导出为 `.vn.zip` 作品包。
- **Agent 全自动制作**：如已配置生图与音频服务或 Agent 自身具备生图能力，可由 Agent 完成提示词改写、批量生图与拼图审图、立绘批量裁切、声音导演与音频绑定，并交付完整作品包。

<p align="center"><img src="docs/screenshots/manager-portrait.webp" alt="资产管理器：人物立绘与画面描述" width="90%"></p>
<p align="center">
  <img src="docs/screenshots/manager-presets.webp" alt="制作预设" width="44%">
  <img src="docs/screenshots/manager-cut-in.webp" alt="特写插图与提示词" width="44%">
</p>
<p align="center"><sub>资产管理器：人物立绘与画面描述、制作预设、特写插图。</sub></p>

### 多端书架、阅读统计与作品分享
- **两种部署形态**：提供开箱即用的本地网页服务（书架、阅读器与资产管理器合一），以及支持 Docker 部署的个人云端书架。
- **按需加载与跨设备续读**：书架解包存储作品并按阅读进度预取后续图片；同一云端书架自动同步最新阅读位置与读完记录。
- **阅读统计与首尾卡片**：内置月相热力图与按年／逐书阅读统计，读完全书后展示包含阅读时长、菱形评分与短评的结尾卡片，书架卡片支持展示读完状态与评分。

<p align="center"><img src="docs/screenshots/shelf-stats.webp" alt="月相阅读统计与逐书时长排行（示例数据）" width="90%"></p>
<p align="center">
  <img src="docs/screenshots/shelf-ratings.webp" alt="书架与评分状态（示例数据）" width="44%">
  <img src="docs/screenshots/end-card.webp" alt="读完结尾卡片与短评（示例数据）" width="44%">
</p>
<p align="center"><sub>书架阅读统计（月相热力图与逐书排行）、书架评分状态、结尾卡片（以上为示例数据）。</sub></p>

---

## 快速开始

### 下载开箱即用包（推荐）

需要本机已安装 **Node.js 20+**，**无需 `npm install` 或构建**。前往 [GitHub Releases](../../releases) 按需下载以下两种压缩包并解压：

- **完整本地使用包（`vnify-<版本>-local.zip`，制作＋阅读合一）**：同时包含本地书架与阅读器、Agent 制作技能、命令行工具及预构建资产管理器。Windows 双击 `start.cmd`，macOS 双击 `start.command`（或运行 `npm start`），单个本地服务同时提供书架与阅读器（`http://127.0.0.1:4173`）和资产管理器（`http://127.0.0.1:4173/manager/`）；打开首页即可“试读示例”或导入 `.vn.zip`／`.vn.txt`／作品文件夹，将同一目录作为 Agent 工作区即可制作作品并立刻在本地书架试读。
- **纯制作最小包（`vnify-<版本>-kit.zip`，不足 1 MB）**：仅包含 Agent 制作技能、命令行工具及预构建资产管理器（不含书架、阅读器与随附字体），双击 `start-manager.cmd` / `start-manager.command` 或运行 `npm run manager` 启动资产管理器，适合已部署云端书架或只需极简制作工作区的用户。

升级时将新版本压缩包解压覆盖同一目录即可，用户自己的 `input/`、`works/`、`data/` 与 `presets.json` 等文件均不会被覆盖。

### 从源码运行

克隆仓库后可直接用 **Node.js 20+** 运行：

```bash
# 启动本地书架与阅读器（无需安装依赖），浏览器访问 http://127.0.0.1:4173
npm start
```

Windows 也可直接双击根目录的 `start.cmd`，macOS 双击 `start.command`。

在源码仓库中使用本地资产管理器时，先执行 `npm install` 安装前端构建依赖（同时安装可选的 `sharp` 用于打包转 WebP）：

```bash
# 构建资产管理器并启动本地服务（书架：http://127.0.0.1:4173，管理器：http://127.0.0.1:4173/manager/）
npm run manager
```

---

## 阅读与书架指南

- **推进与回退**：鼠标左键点击、按 `Space` 或 `→` 前进，按 `←` 回退；向上滚动滚轮、按 `↑` / `H` 或在触屏设备下滑展开历史记录；按 `V` 开关朗读，按 `A` 切换自动播放，按 `↓` 隐藏对话框。
- **信息交互**：悬停或点击正文内带标记的人名、原书注解与世界词条可查看浮层说明；触屏设备首次点击人名显示简介卡，再次点击打开完整人物页。
- **菜单与面板**：点击右上角 `☰` 展开菜单，可打开**人物**、**词条**、**图集**、**附录**与**设置**面板；菜单展开时点击左上角书名卡可查看章节目录并跳转。
- **图集防剧透**：图集按封面、氛围背景、地点、地点差分、CG、特写与原书图片分类展示。尚未读到的图片默认隐藏，支持单张点开或开启“显示全部”。
- **阅读设置与声音**：提供逐句分屏／按原文自然段分屏切换、主题选择（Dark、Folio、Soda）、对话框行数与透明度、字号、行距、逐字显示速度及自动播放停留时间设置，并配有实时画面预览。可开启朗读（台词，或台词与旁白），默认使用浏览器自带语音，并支持 Fish Audio、ElevenLabs 与 Gemini TTS 三家云端朗读（key 只存在本机浏览器，合成请求经书架服务转发、不保存 key；作品自带 `// @vn-voices` 音色分派时自动按分派朗读，缺少对应服务的 key 时在设置中提示）；自动播放时会等语音读完再推进。作品包带音乐、环境音与音效时，背景音乐按阅读位置无缝循环并自动响度均衡（换曲交叉淡入淡出、朗读时压低），环境音随场景地点循环，音效仅在顺读到对应句子时播放；打开菜单与面板、选择与进入章节扉页时带有随主题变化的轻微界面音效（推进正文不出声）。总音量、音乐、环境音、音效、界面音效与语音音量均可独立调节。阅读菜单与结尾画面的“致谢”列出原作、生成图片所用的模型、音乐与音效的作者及许可证、使用的音色与说明。
- **标题画面与结尾**：进入作品时显示封面、书名、作者与简介；回来续读时显示上次读到的章节与进度，读完的作品显示读完日期与评分，可重新阅读或回看结尾。读完全书后进入结尾卡片，显示总阅读时长与日期，可打分（五颗菱形）并写短评。一次读到结尾即记为读完，之后往回翻不影响。
- **书架管理**：首页支持切换横版封面、竖版封面与列表视图，支持自定义主页背景照片。通过作品卡片菜单可修改书名、作者与简介，补填评分与短评，将作品导出为 `.vn.zip` 分享包，或移出书架（移入书架目录下的 `.trash` 文件夹）。
- **阅读统计**：书架标题旁的月相图标切换到阅读统计：按年或全部查看阅读时长、读完本数、阅读天数与最长连续天数，每天的阅读以月相热力图显示，每本书的时长、评分与读完日期可排序。书架设置可选在卡片上显示评分。

---

## 作品制作流程

作品制作由 Agent（如 Claude Code、Cursor、Codex 等具备文件读写与命令行能力的环境）配合制作工作区完成。需要 **Node.js 20+**。

### 1. 获取制作工作区

- **直接下载（推荐）**：从 [GitHub Releases](../../releases) 下载**完整本地使用包**（`vnify-<版本>-local.zip`，制作＋阅读合一）或**纯制作最小包**（`vnify-<版本>-kit.zip`，仅制作工具与资产管理器）并解压，该文件夹即为独立制作工作区。可选在工作区内执行 `npm install`（或在资产管理器导出时点“安装 sharp”）安装 `sharp`，使打包 `.vn.zip` 时自动将图片转为体积更小的 WebP。
- **从仓库导出或直接使用**：克隆本仓库后可直接将仓库根目录作为工作区；也可导出独立工作区到新目录：

```bash
# 导出纯制作最小工作区（不含书架与阅读器）
node scripts/export-skill-kit.mjs --out <目标目录>

# 导出制作＋阅读合一的完整本地工作区（预构建资产管理器，免 npm install）
node scripts/export-skill-kit.mjs --out <目标目录> --with-reader
```

### 2. 制作三步流程

1. **配置制作预设**：启动资产管理器（`npm run manager`，访问 `http://127.0.0.1:4173/manager/`），在“制作预设”页选择“视觉小说”或“绘本”模板，配置交付档位（仅转换文本／文本＋导演提示词／完整配图）、正文风格、画面比例、画风及各资产疏密，保存至工作区 `presets.json`。
2. **转换剧本与整理资料**：将原书 `.txt` 或 `.epub` 放入工作区的 `input/` 目录，在 Agent 会话中打开工作区，指示 Agent 按 [vn-convert](skills/vn-convert/SKILL.md) 转换作品。Agent 会调用本地工具完成原文编号、章节划分、正文分批改写、人物档案与世界词条提取及程序校验。若希望从设定资料直接创作原创中短篇，可指示 Agent 读取 [vn-story](skills/vn-story/SKILL.md)。
3. **资产管理、配图与配乐打包**：配图既可由 Agent 调用宿主生图工具完成，也可由 Agent 按资产管理器“生成与搜索”中配置的 NovelAI、ComfyUI、OpenAI 兼容接口及 Pexels / Pixabay 图库搜索自动执行（支持拼图审图、改写提示词重画与批量立绘头像裁切），或在管理器中手动批量生成、去背、上传并设置可选结尾图。声音同样在管理器与命令行协同完成：在“生成与搜索”配置 Fish Audio、ElevenLabs 或 Gemini TTS 音色库，由全书设计写出声音画像并分派音色；声音导演按章规划环境音、音效点与背景音乐切换点，按预设来源顺序从本地音频库、Freesound（默认 CC0 / CC-BY）或 ElevenLabs / ComfyUI（如 ACE-Step）/ Lyria（Gemini API）获取并绑定音频（Freesound 与生成的音效默认自动沉淀到本地音效库复用），最终一键导出 `.vn.zip` 作品包并导入书架。

---

## 部署个人云端书架

可将书架与阅读器部署到个人服务器，通过访问口令登录后多端访问并同步阅读进度与读完记录。云端模式仅暴露阅读器、书架接口与朗读转发（透传至 Fish Audio、ElevenLabs、Gemini TTS 合成接口，不保存 key），登录状态通过 HttpOnly Cookie 保存 30 天。

### Docker Compose 部署

在已安装 Docker 的服务器上克隆仓库并配置环境变量：

```bash
git clone https://github.com/gaaawaaag/vnify /opt/vnify
cd /opt/vnify
cp .env.example .env
```

编辑 `.env` 文件，填写域名与访问口令（至少 16 个字符）：

```ini
VN_DOMAIN=vn.example.com
VN_ACCESS_TOKEN=替换为至少16位字符的访问口令
```

根据服务器环境选择启动方式：

- **服务器已有反向代理**：直接运行 `docker compose up -d`，将域名反向代理至 `http://127.0.0.1:4173` 并启用 HTTPS。
- **服务器未占用 80/443 端口**：取消 `.env` 中 `COMPOSE_PROFILES=caddy` 的注释后运行 `docker compose up -d`，内置 Caddy 会自动申请并续期 HTTPS 证书。

常用维护命令：

```bash
docker compose logs -f                 # 查看日志
git pull && docker compose up -d --build  # 更新版本
docker compose cp vnify:/data ./backup # 备份书架数据
```

### Node.js 直接运行

不依赖 Docker 时，可直接使用 Node.js 20+ 启动服务并配合任意 HTTPS 反向代理：

```bash
VN_CLOUD_ORIGIN="https://vn.example.com" \
VN_ACCESS_TOKEN="替换为至少16位字符的访问口令" \
VN_DATA_DIR="/var/lib/vnify" \
PORT=4173 \
node src/server/server.mjs
```

---

## 常用命令与示例

<details>
<summary>示例脚本与常用命令</summary>

`examples/` 目录包含可直接导入试读的原创示例脚本：
- [rainy-visit.vn.txt](examples/rainy-visit.vn.txt)：包含多场景、人物档案与演出的完整示例
- [documents.vn.txt](examples/documents.vn.txt)：信件（`message`）与诗歌题记（`verse`）排版示例
- [annotations.vn.txt](examples/annotations.vn.txt)：原书行内注解示例
- [cg.vn.txt](examples/cg.vn.txt) / [cut-in.vn.txt](examples/cut-in.vn.txt)：全屏 CG 与行间特写插图示例
- [variants.vn.txt](examples/variants.vn.txt)：人物与地点差分切换示例
- [pages.vn.txt](examples/pages.vn.txt) / [guest-dialogue.vn.txt](examples/guest-dialogue.vn.txt)：同屏逐句追加与临时人物对白示例

常用命令行工具：

```bash
# 校验剧本格式与引用完整性
npm run validate -- "examples/rainy-visit.vn.txt" --strict

# 为原书 TXT 或 EPUB 生成行号映射与分批文件
npm run number-source -- "input/novel.txt" --out "works/my-novel/source-r01"

# 修改 docs/prompts_v3 提示词源文件后重新编译提示词库
npm run prompts:build

# 检查提示词库与源文件一致
npm run prompts:check
```

</details>

---

## 目录结构

<details>
<summary>展开目录说明</summary>

```text
index.html        书架与播放器入口
src/
  core/           正文解析、人物资料、导演、差分与原书附录等核心协议
  reader/         阅读状态、资产清单与作品包读写
  production/     生图任务规划、去背与资产绑定
  conversion/     原文编号、EPUB 解析、分批合并、校验与导演请求组装
  ui/             书架、播放器、全屏面板与设置界面
  manager/        本地资产管理器前端（React + Vite + TypeScript）
  server/         本地 HTTP 服务、书架存储、管理器接口与云端模式
  prompts/        编译后的提示词库
styles/           样式变量（tokens.css）、组件样式与阅读主题（themes/）
scripts/          校验、编号、补丁、去背、提示词构建与工作区导出脚本
skills/           Agent 制作技能（vn-convert、vn-director、vn-story）
examples/         原创示例脚本
docs/             格式规范、导演协议、资产清单与主题指南
input/            待转换的原书文件目录
works/            各部作品的制作工作目录
```

</details>

---

## 文档导航

| 文档 | 说明 |
| --- | --- |
| [剧本格式规范](docs/format.md) | `@vn 0.10` 正文语法、人物资料容器、分屏、文档块、原书注解与 CG 规则 |
| [导演与配图规范](docs/director.md) | 全书视觉设计、章节导演、立绘与背景规划、图片任务生成及绑定流程 |
| [人物与地点差分](docs/variants.md) | 人物与地点差分定义、状态记录语法、跨章延续与回退规则 |
| [特写插图（Cut-in）](docs/cut-ins.md) | 行间特写插图的定义、显示区间与清单结构 |
| [背景与作品包资产](docs/background-assets.md) | 背景清单（封面、氛围图、地点、CG、特写、差分）、音频／音色记录与 `.vn.zip` 作品包结构 |
| [提示词写法](docs/prompt-formats.md) | 按生图预设改写提示词、CG 人物参考图与模型直接输出透明立绘规范 |
| [主题制作指南](docs/theme-guide.md) | 播放器主题目录结构、可调 CSS 变量、图标与界面音效配置及校验方法 |
| [提示词源文件说明](docs/prompts_v3/README.md) | 提示词模块结构与编译命令 |

---

## 许可

- 代码与文档：[MIT](LICENSE)。
- 字体：随附字体各自保留原许可（SIL OFL 1.1 与朝华打字机的作者授权），署名与许可文本见 [assets/fonts/README.md](assets/fonts/README.md)。
- 作品：本工具不附带任何小说作品。转换的原文、生成的图片与导出的作品包，其使用与分享是否获得授权由使用者自行确认。
