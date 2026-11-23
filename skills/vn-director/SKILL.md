---
name: vn-director
description: 为 vnify. 的 .vn.txt 或 .vn.zip 制作导演提示词（Director v13：全书设计、氛围背景、地点背景、CG、Cut-in、人物立绘、差分与立绘出场），并按用户选择用 agent 环境中的生图工具配图打包，或只交付带提示词的成品供用户自行配图。依赖同仓库 Node.js 工具；不制作六格表情。
---

# VN 导演

为已转换的正文制作导演提示词，再按用户的选择配图或只交付提示词。原小说先用 [vn-convert](../vn-convert/SKILL.md) 转换。

## 开始：方案与预算

本技能与 vnify. 仓库或其最小制作环境一起使用，需要 Node.js 20+。仓库根目录是本文件的 `../..`，命令在该目录运行。按[制作文件与命令](references/workflow.md)建立或恢复清单；续跑只处理未完成的部分。

设置的取用顺序与 vn-convert 相同：**本次明确要求 → 本作品方案（`notes.md` 的“制作方案”）→ 制作预设（`node scripts/presets.mjs <预设名>`）→ 下方默认**。开始前用一两句话说明本次方案，没有冲突就继续；只在要求互相冲突、需要付费生成或要突破用户给的上限时询问。

- **制作预设**：`presets.mjs` 输出的 `directorOptions` 直接写进清单 `options`，`transparencyMethod` 写在清单顶层。画面比例（`ratio`）已在其中：packet 告诉导演画布方向，背景、氛围图与 CG 任务带 `aspectRatio` 按它出图（封面随横竖屏取 16:9 或 2:3，特写 1:1、立绘 2:3 不变）。预设里另有一项没有清单字段，按下面做：
  - 图片种类的 `notes`：追加到该类图的提示词，或作为这类图的取舍标准；`limit`：全书图片总数的硬上限（见下方“全书上限”）。
  - 生图方式（`preset.drawing`）：导演只写自然语言底稿，与所用模型无关。`agent` 时由你用宿主工具生图，`drawing.notes` 是写法说明，生图时与 `image-models/` 一起用来调整措辞。输出带 `imageScheme` 时（挂载了生图预设），把它原样写进清单顶层 `imageScheme`：交付结果是“完整配图”时由你用资产管理器的这些设置生图（见下方“配图（用管理器的生图设置）”），否则用户在资产管理器里点生图；`mounted` 中 `format.notes` 不为空的预设，在导演完成后按[制作文件与命令](references/workflow.md#按生图预设改写)改写提示词，`missing` 的预设告诉用户已不存在。
  - 先搜图库（`preset.kinds.ambient.search`／`location.search`，输出的 `imageSearch.kinds` 列出这些种类）：交付结果是“完整配图”时，这类图生成之前先在图库里找：`node scripts/draw-images.mjs <清单> --search "<英文画面关键词>" --out <hits.json>` 按作品方向搜 Pexels 与 Pixabay（列出编号、名称、作者与尺寸），挑一张与画面描述、时代、气氛相符的用 `--use <图片 key> --hits <hits.json> --n <序号>` 绑定，作者随图记入致谢；没有合适结果时换一次关键词，仍没有就照常生成。同一作品里照片与生成图混用时留意画风差异，差异大时告诉用户。没有图库 key 时（输出的 notes 会说明）直接生成。
  - 声音（`preset.sound`）：`voice` 不是 `off` 时 `directorOptions` 带 `voicePortraits:true`，全书设计按 packet 写 `voices`（声音画像），`sound.notes` 是用户对声音的补充要求，写画像时照办。`voice` 为 `assign` 时，设计登记后再按 `presets.mjs` 输出的 `soundSources.voices`（勾选的服务列表，按优先级排序，可为 `fish`、`elevenlabs`、`gemini`）分派音色：先用 `node scripts/voices.mjs list <清单>` 查看全部说话角色、台词数与画像，只从勾选的服务里挑（未勾选任何服务时只写画像）。`fish` 与 `elevenlabs` 从工作区根目录的 `voices.json` 里按语言相符（或未注明语言）的音色与备注挑选；勾选了 `gemini` 时，除 `voices.json` 里已收藏的 Gemini 音色外，直接用 `node scripts/voices.mjs search --sources <服务列表> [--lang <作品语言>|all] [--gender male|female|neutral] [--pitch low|medium|high] [--query "<关键词>"]` 从 Gemini 官方预置音色库自动查询并选配（无需先加入 `voices.json`；Gemini 官方库中标记为中文的音色很少，但全部官方预置音色尤其是 30 个基础音色均原生支持中文，中文作品可直接用 `--lang all` 按性别、音高和描述挑选），再用 `node scripts/voices.mjs bind <清单> <角色> <服务:音色ID> "<音色名>"` 绑定到 `director/voices.json`（或手写 `director/voices.json` 并在清单写 `"voices":"voices.json"`，格式见[制作文件与命令](references/workflow.md)的 `voices`）；没有合适的角色留空，交付时告诉用户可在资产管理器的“声音”里另选或设计。没有任何可用音色库与密钥时只写画像。
  - 音效（`preset.sound.effects`）：为 `full` 时，`presets.mjs` 输出带 `soundOptions`（疏密与补充要求），原样写进清单顶层 `soundOptions`。导演稿登记后按章做声音导演：`node scripts/direct-vn.mjs <清单> --sound-packet <章节ID> --out <文件>` 取 packet，按其中规则写本章的环境音与音效点 JSON，存为 `sounds/<章节ID>.json` 并登记到清单 `soundDrafts`（`{"ch01":"sounds/ch01.json"}`）；有全书设计时各章可并发，后写的章节看不到并发章节新定义的声音，重复的定义合并时只保留先登记的一条（ID 相同即视为同一声音）。全部章节登记后再绑定文件，来源与顺序取 `presets.mjs` 输出的 `soundSources.effects`（`local` 本地音效库、`freesound`、`generate` 用音效预设生成）：`node scripts/sounds.mjs list <清单>` 列出声音、搜索词与已生成个数，逐个声音按顺序试每个来源，找到合适的就绑定、不再试后面的来源。搜索类来源用 `node scripts/sounds.mjs search "<搜索词>" --sources <来源> --out <hits.json>`（Freesound 搜索优先用 1–2 个英文核心词，长短语易返回 0 命中），按名称、备注、时长与许可证挑一条 `node scripts/sounds.mjs bind <清单> <声音ID> <hits.json> <序号>`（序号从 0 开始，也可传命中的素材 ID）；没有合适结果时换一次搜索词再试同一来源。轮到 `generate` 时用 `node scripts/sounds.mjs generate <清单> <声音ID> "<英文描述>" --preset <soundSources.effectPreset> [--seconds N]` 生成并绑定（描述取声音的 prompt 或按名称与搜索词写，环境音自动生成可循环音频），全作品生成个数不超过 `soundSources.generateLimit`。所有来源都没有合适结果就留空，交付时列出。来源都没设置时只写声音稿。
  - 音乐（`preset.sound.music`）：不是 `off` 时 `directorOptions` 带 `musicTracks:true`，全书设计按 packet 写 `music`（曲目数按 packet 里的数量档位，每首英文描述），`soundOptions.musicDensity` 原样随 `soundOptions` 写进清单；`soundOptions.music` 为 true，声音导演 packet 同时要求写本章的音乐切换点（`music:[{"from":"单元ID","track":"曲目ID 或 null"}]`），写在同一份声音稿里。`music` 为 `full` 时，全部章节登记后按 `soundSources.music` 的顺序为每首曲目找文件（`local` 本地音乐库、`freesound` 音乐分类、`generate` 用 `soundSources.musicPreset` 指定的音乐预设生成）：`node scripts/music.mjs list <清单>` 查看曲目与文件；搜索类来源用 `node scripts/music.mjs search "<英文情绪与风格词>" --sources <来源> --out <hits.json>`，按标题、备注、作者与许可证挑一条 `node scripts/music.mjs bind <清单> <曲目ID> <hits.json> <序号>`（序号从 0 开始），曲目要能循环作背景，避免人声和过短的片段；轮到 `generate` 时对仍没有文件的曲目运行 `node scripts/music.mjs generate <清单> <曲目ID|--missing|--all> --preset <soundSources.musicPreset>`（`--all` 用于全部重生成并覆盖旧绑定；按服务计费，用户没要求完整音乐时不生成）。都没有合适结果、没选音乐预设或生成失败的曲目留空，交付时告诉用户可在资产管理器的“音乐”里搜索、上传或生成。
- **是否生图**：由交付结果决定。“文字＋配图提示词”（默认）只写导演提示词；“完整配图”才生图：清单有 `imageScheme`（预设挂载了生图预设，或用户要求用资产管理器里填好的本地／API 设置）时用资产管理器的设置，否则用 agent 环境中的生图工具。用户要用资产管理器设置而预设没有挂载时，`node scripts/draw-images.mjs <清单> --presets` 列出资产管理器的生图预设，按用途写 `imageScheme`（`{"uses":{"standing":"预设ID","background":"…","cg":"…","cutin":"…","cover":"…","variant":"…"},"cutout":"program"}`，只写该预设 `uses` 里有的用途）。生图会计费而用户没说要配图时，先问；用户没限定范围时做到整本。
- **人物图**：每个人物（及其每个差分）只做一张 2:3 透明立绘（`standing:true`，默认开启），头像由播放器从立绘裁出，不另做头像；不要人物图时设 `standing:false`。
- **画风**：背景与人物两条画风各有来源（清单 `styleModes`，文字在 `backgroundStyle`／`characterStyle`）：`model` 由导演在全书设计（或第一章）决定；`expand` 是用户给的方向，导演按 packet 写成完整画风；`fixed` 是用户的原文（如 NAI 画师串），程序直接使用，导演不写这一方。默认两方都是 model；`styleMode:"user"` 是两方 fixed 的简写。画风确定后全书沿用。
- **疏密**：清单 `density` 按种类给档位 few／medium／rich（`ambients`、`locations`、`cgs`、`cutIns`、`characterVariants`、`locationVariants`；默认适中，特写与差分为少量），packet 带上这些档位，导演按提示词里的标准取舍，程序不按字数限额。用户说“少量／适中／丰富”时对应设置；给出总数时见下方“全书上限”。
- **差分**：默认不做。用户要求时开启 `characterVariants`／`locationVariants`：全书设计登记可预见的差分并为主要人物标 `main:true`，各章用状态记录安排使用范围；主要人物每人最多 4 个，其他人物 1 个且只在外观变化影响理解剧情时做，地点每处 2 个。差分图优先以默认图为参考编辑生成；没有图像编辑工具时按任务的文生图提示词绘制，交付时说明一致性可能较差。规则见 [variants](../../docs/variants.md)。
- **立绘出场**：开启人物立绘时随之生效，不另设开关。播放器在 scene 中让最近几轮说过话的人物以立绘同屏（宽屏最多 3 人、窄屏 2 人，说话人在前、其余压暗）；人物进出现场由导演在 `states` 写 `present` 记录：场中每一次进入与离开、隔门／电话里说话的人物，以及第一人称叙述者（第一章写一条持续不上场）；规则排错的段落（如对着不开口的人长谈、人多时只有两三人在谈）写 `stages`。旁白描写在场人物外貌的位置由程序按外观摘录自动安排此人上场，不用为此写 `stages`。立绘按同一图片高度显示、发顶对齐，保存了头像范围的按头像框统一头的大小（取景须统一，见[生图与打包](references/images.md)），儿童与明显矮小或高大的人由导演写 `stature`。规则见 packet。
- **样图**：默认不做。用户要求先看样图时，在全书设计之后、其余章节导演之前，从 `--jobs` 挑 1–2 个主要人物和 1 个常用地点先生成给用户看：满意就登记这些图继续；不满意按反馈改写 design.json 的 `artStyles`（或用户自填的画风）后重新打样。画风在章节导演登记后锁定。
- **参考图**：用户提供人物或地点参考图（包括其他工具产出的参考图）时，在清单 `references` 按稳定 ID 登记，任务会附上参考图与对应提示词，见[生图与打包](references/images.md)。交接包的高光图是原作的关键画面：逐章导演时把该章高光的名称与正文范围附在 packet 之后，作为 CG 选择参考；导演在那里安排 CG 时，该画面自动作为构图参考。
- **用户提供的立绘**：用户直接给出某些人物的成品立绘时，不再生成这些默认图：把文件登记进清单 `images`（`purpose:"standing"`，须为 2:3 的 PNG／WebP，透明方式与本作一致；不合比例先补边或裁切到 2:3，并告诉用户；取景与其他立绘明显不同时告诉用户）。用户只给了方形头像时，把它当作该人物的参考图，仍生成立绘。差分以这些图为默认图编辑；漫画等参考图留给差分和没有提供立绘的次要人物。
- **生图模型**：用户说明所用模型或渠道时，记入本作品 `notes.md` 的制作方案，并在制作环境根目录 `image-models/<模型>.md` 写一份提示词说明（用户提供的直接放入；没有时按模型官方文档撰写），生图时按它调整措辞。透明立绘由工具直接出透明图时 `transparencyMethod` 用 native（默认）；工具只能出实色背景时用 cutout：纯色背景生成后用 `scripts/cutout.mjs` 去背，用户有自己的去背工具（如 ComfyUI）时用用户的。
- **全书上限**：用户给出全书图片总数时写入清单 `imageLimit`：所有种类合计（封面、氛围、地点、CG、特写、立绘、差分；复用不计数），程序在登记全书设计与各章时检查，packet 告诉导演还剩几张。在全书设计中先分配给主要地点和反复出现的场面，各章复用已有图片。用户只限定某一类（如“背景最多 12 张”）时也是硬上限：生图前用 `--jobs` 核对该类的待生成数量，超出就合并或省略，不突破。

额度是上限，不是配额：允许 8 张不代表要画 8 张，优先覆盖反复出现的重要地点和人物，复用已有素材。批次只是转换时的处理单位，不影响图片数量。

## 制作提示词

1. **全书设计**（单章作品也做，封面在这里决定）：`--design-packet` 取得请求，按其中规则写一份 JSON（画风、主要人物外貌、常用地点主图、反复出现的氛围图、作品封面），保存为 `design.json` 并在清单登记 `"design"`。输入里的人物与地点来自正文，外观以清单 `visualProfiles` 为准（转换阶段的 `visual-profiles.json`，原文对人物与地点外观的描写摘录；原文没有外观描写时写 `[]`）；清单缺少这一项时 `--design-packet` 与未登记设计时的 `--packet` 会拒绝运行，回到转换目录整理出这个文件再继续。设计只是制作状态，不进入阅读稿。
2. **逐章导演**：每章 `--packet <章节ID>` 取得完整规则与材料，按其要求写该章 JSON，原样保存后登记到 `directors`。每章的 JSON 都在读过该章 packet 后写成，不拿一章的 packet 或模板用脚本批量生成其他章；子代理因限流、超时等失败时，等待后重试或在 notes 记为待办，不改用摘要、关键词检索或脚本代写。登记了全书设计后，各章互不依赖，可以并发或交给子代理；程序在登记时按“先定先用”对齐：地点沿用设计或更早章节的主图描述，设计中的人物在首次出场章节自动补上，重复的新 Cut-in ID 视为复用。正文来自 [vn-story](../vn-story/SKILL.md) 时，可把其 `vn-notes.md` 中本章的 CG 时刻附在 packet 之后作为选择参考，是否采用仍按 packet 规则与预算决定。
3. **校验与修订**：登记后运行 `--jobs` 或成品导出检查；各章在 `designConflicts` 记下原文与已有人物设计或地点主图的出入，`--jobs` 的导演状态逐章列出，按原文核实后改 `design.json`（或定义该设计的早先章节），程序在登记时把改后的设计带到各章；报错时修有依据的结构或语义问题，提供该章完整替代 JSON（原始回复与修订稿分别保存）。正文改动后重新核对受影响章节的 CG／Cut-in 范围。

规则唯一来源是 prompts_v3，packet 已按开启的用途组合好，直接把 packet 全文交给写稿者（或你自己），不要只给对方读不到的路径，也不另叠加其他配方。CLI 只组装、校验和打包，不调用任何模型或生图服务。已验收的导演稿不自动重写；整本换画风另建制作目录与清单。

## 配图（用管理器的生图设置）

导演稿全部登记、校验通过，并按[制作文件与命令](references/workflow.md#按生图预设改写)完成改写（预设要求改写时）之后开始生图。用 `scripts/draw-images.mjs`，它运行与资产管理器相同的生图队列：按 `imageScheme` 为每张图选预设，密钥取自用户目录，图片生成后立即绑定并记入 `generated.json`，管理器里能看到并可换回旧图。步骤与检查见[生图与打包](references/images.md#用管理器的生图设置)：分批生成缺图，逐张查看实际图片，有严重问题时改写这张图的提示词重画，立绘绑定后裁出头像框，最后导出 `.vn.zip`。

## 配图（选择了 agent 自带工具时）

按[生图与打包](references/images.md)：`--jobs` 取得各章导演状态、可执行的缺图队列与暂缓项；每项用 jobs 给出的提示词（画风与用途模板已由程序拼好；内容不变，措辞可按 `image-models/` 的模型说明调整），按手头工具选文生图、参考图或编辑，逐张生成后查看实际图片，检查通过后转为 WebP 以减小作品包体积，登记尺寸与绑定，再导出 `.vn.zip`。需要暂缓的写进清单 `holds` 并注明原因，可完成的部分照常交付。

## 只做提示词时

导出含导演提示词的 `.vn.txt`；已有图片或输入是带 Extra 的 `.vn.zip` 时导出 `.vn.zip`。播放器只读，不显示提示词也不能换图；用户自己配图时，把图片按[生图与打包](references/images.md)登记进清单后重新导出，或由用户在资产管理器中上传绑定并导出作品包。不要只交孤立的 JSON 或提示词清单。

## 交付

```sh
node scripts/direct-vn.mjs "<目录>/project.json" --out "<目录>/story.vn.txt"
npm run validate -- "<目录>/story.vn.txt" --strict
```

配了图时再导出 `.vn.zip`；输入是带 Extra（书外原文、原书插图）的 `.vn.zip` 时也导出 `.vn.zip`，Extra 随包保留，单独的 `.vn.txt` 不含 Extra。交付文件链接，分开报告：提示词是否齐全、图片是否齐全（剩余任务及原因）、正文是否到作品终点，以及采用的画风。部分配图可以交付，但不说成全部完成。
