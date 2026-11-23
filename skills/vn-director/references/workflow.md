# 制作文件与命令

Cut-in 单图制作见 [规范](../../../docs/cut-ins.md)。新清单添加 `cutIns:true`，各章定义全书可复用的图片及本章范围；复用不算新图。图片文件的 purpose 为 `cut-in`、refs.scope 为 `cutIns`。

以下命令在仓库根目录运行，清单内路径相对清单所在目录。推荐工作目录 `works/<作品>/director`；用户指定位置时沿用。工具仅组装、校验和打包，由当前 agent 编写提示词，不调用模型 API。

`project.json` 最小例子：

```json
{
  "format": "vn-agent-director-1",
  "input": "../convert/story.vn.zip",
  "options": {
    "protocolVersion": 13,
    "cutIns": true,
    "enabled": true,
    "ambients": true,
    "locationBackgrounds": true,
    "cgs": true,
    "standing": true,
    "characterVariants": false,
    "locationVariants": false,
    "density": {"cutIns": "few"},
    "styleMode": "model"
  },
  "directors": {}
}
```

`input` 指向 vn-convert 交付的作品（同一作品目录下的 `convert/`），可为 `.vn.txt` 或 `.vn.zip`；`.vn.zip` 中的原图片、Extra 与绑定会保留。可选字段：

- `design`: 全书设计 JSON 文件路径（见下文）。登记后各章 packet 带设计，可并发编写；登记时程序按设计与更早章节对齐地点主图、补入首次出场的设计人物。
- `chapters`: 要处理的章节 ID 数组，省略为全部。未选中的正文及已有导演结果保留。
- `options`: 新任务使用上方 v13 设置。作品封面（titleCard，归环境开关，默认 true）由全书设计提供，设 `titleCard:false` 关闭；结尾图（endCard，默认 false，制作预设“结尾图”打开时为 true）同样由全书设计提供，读完全书后显示在结尾卡片背后。`standing` 是人物立绘开关（每人一张 2:3 透明立绘，头像从中裁出），默认 true；backgrounds 是环境总开关，默认 true；CG 归环境开关控制，但使用人物画风。画风按 `styleModes:{background,character}`（各为 model／expand／fixed）设定，fixed 的原文或 expand 的方向写在 backgroundStyle／characterStyle，相关用途需要的不能空白；fixed 由程序原样使用，导演只写其余一方；`styleMode:"user"` 等于两方 fixed。
- `visualProfiles`: vn-convert 交付的 `visual-profiles.json` 相对路径或内联数组 `[{"id":"人物或地点ID","look":[{"source":"来源ID","text":"原文摘录","when":"可选"}],"note":"可选"}]`。程序按来源在正文里找到摘录所在的句子，交给导演的是正文自己的文字；找不到的摘录略去，在命令输出的 `warnings` 与 `--jobs` 的 `droppedLooks` 里列出，不算错误，可回转换目录核对后改正。`note` 是用户或参考图说明给出的外观，不核对来源。原文没有外观描写时写 `[]`。开启人物立绘或地点背景时，`--design-packet` 与尚未登记设计时的 `--packet` 要求清单有这一项。开启人物立绘时，旁白描写在场人物（本场有台词）通常样子的位置，程序在成品里自动加一段镜头区间（`auto:true`）：描写较长时台上只留此人，较短时此人上场并站到前面（`join:true`）；导演自己写的 `stages` 优先。
- `directors`: 章节 ID 到完整导演 JSON 文件的映射，如 `{"ch01":"directors/ch01.json"}`。只登记已写好的文件；同章替换输入中的旧导演稿。
- `images`: 已完成图片，格式见[生图与打包](images.md)。
- `holds`: 暂缓的图片任务，`{"任务ID":"原因"}`，见[生图与打包](images.md)。
- `prompts`（资产管理器写入）: 手动改写的实际提示词文件，`{"任务ID":"提示词"}`，差分的编辑提示词用 `任务ID#edit`；`--jobs` 用它替换组装出的提示词并标 `promptEdited:true`。
- `revisions`（资产管理器写入）: 输入里已有导演记录被改写后的文件，`{"ch01":"revisions/ch01.json"}`；仍按输入原有记录检查，与 `directors` 的新导演稿不同。资产管理器改导演稿或全书设计时另存 `ch01.r1.json`、`design.r1.json` 并改指向，原稿保留。
- `titleCard`（资产管理器写入）: 没有全书设计时改写的封面描述 `{"prompt":"…"}`。
- `endCard`（资产管理器写入）: 没有全书设计时写的结尾图描述 `{"prompt":"…"}`。
- `references`（可选）: 用户提供的参考图，`[{"file":"refs/lin.png","entityId":"lin"}]`，某个差分专用的加 `variantId`，Cut-in 用 `cutInId`；也可写参考图清单文件的路径（如 import-handoff 生成的 `references.json`，图片路径相对该文件），见[生图与打包](images.md)。
- `music`（可选）: 音乐清单 JSON 文件路径，`{"tracks":[{"id":"rain","name":"雨夜","prompt":"可选","file":"可选，相对该 JSON 的 MP3／M4A／OGG","source":{"title":"","author":"","url":"","license":""}}],"cues":[{"from":"单元ID","track":"rain"}]}`。`cues` 按正文顺序列出切换点，每个切换点从该单元起换成 `track`（`null` 为静音），持续到下一个切换点，可以跨章。曲目与切换点写进成品正文的音乐记录，有 `file` 的曲目连同来源打进作品包；没写 `file` 的曲目沿用输入作品包里已绑定的文件。省略 `music` 时保留输入原有的音乐。格式见[背景与作品包](../../../docs/background-assets.md#音乐)。
- `sounds`（可选）: 环境音与音效清单 JSON 文件路径，`{"sounds":[{"id":"rain","name":"雨声","kind":"ambience","query":"可选，英文搜索词","file":"可选","source":{…}}],"places":{"地点ID":"rain"},"blocks":{"块ID":"rain 或 null"},"effects":[{"at":"单元ID","sound":"door","phase":"enter 或 shown"}]}`。环境音按地点默认、按块另指定；音效点按正文顺序列出，只给有叙事作用的声音配，没有合适的就不写。文件与来源的写法同 `music`，没写 `file` 的声音沿用输入作品包里的文件。格式见[背景与作品包](../../../docs/background-assets.md#环境音与音效vn-sounds)。
- `soundDrafts`（可选）: 声音导演的各章声音稿，`{"章节ID":"sounds/ch01.json"}`。每份为 `{"chapterId":…,"sounds":[新定义的声音],"places":{"地点ID":"声音ID"},"blocks":{"块ID":"声音ID 或 null"},"effects":[{"at":"单元ID","sound":"声音ID","phase":"enter 或 shown"}]}`，只能写本章的地点、块与单元。按章节顺序合并进 `sounds` 清单（或输入原有的记录）：只补上它还没有的——新的声音、还没配环境音的地点和块、还没有音效点的章节，所以在资产管理器里改过的内容保留。
- `soundOptions`（可选）: 声音导演 packet 的要求 `{"density":"few|medium|rich","notes":"补充要求","effects":true,"music":false,"musicDensity":"few|medium|rich"}`，取自预设输出的 `soundOptions`；`musicDensity` 决定本章换曲的频率（只在 `music` 为 true 时有）；`effects` 为 false 时不安排环境音与音效，`music` 为 true 时同时安排音乐切换点。声音稿的 `music` 为 `[{"from":"单元ID","track":"曲目ID 或 null"}]`，曲目取自全书设计的 `music`；合并规则同音效：全书设计的曲目补进音乐记录，声音稿的切换点只补进还没有切换点的章节。
- `credits`（可选）: `{"notice":"说明","signature":true,"agents":["模型名"]}`。`agents` 写参与制作的 agent 所用模型（如 `Claude Opus 5.5`），列在致谢的“制作”一节；资产管理器“全书设计 → 作品信息”也可修改。
- `voices`（可选）: 音色分派 JSON 文件路径（资产管理器的“声音”或 `scripts/voices.mjs bind` 写入 `director/voices.json`），内容为 `{"labels":{"fish:<音色ID>":"音色名"},"cast":{"narrator":"fish:…","other":"fish:…","characters":{"人物ID":"fish:…"}},"portraits":{"narrator":"…","人物ID":"…"}}`。支持 `fish:<音色ID>`、`elevenlabs:<音色ID>` 与 `gemini:<音色ID>`（Gemini 官方预置音色可直接用 `node scripts/voices.mjs search` 查到并绑定，不必先加入 `voices.json`）。`cast` 里的音色须在 `labels` 中；`portraits` 是声音画像。打包时写进正文的音色记录，阅读器默认按它朗读；省略时保留输入原有的记录。全书设计写了 `voices` 时，设计里的画像补上文件没写到的角色。
- `transparencyMethod`（可选）: 透明人物图的取得方式，native（默认，工具直接出透明图）或 cutout（纯色背景生成后去背，默认用 `scripts/cutout.mjs`）。
- `complete`: 正文是否到作品终点；包输入默认继承，纯文本默认 `true`。仅输入正文前缀时设 `false`；只给部分章节配图不改变它。

先做全书设计（推荐）。尚未登记 `design` 时：

```sh
node scripts/direct-vn.mjs "work/project.json" --design-packet --out "work/design-packet.txt"
```

按 packet 写一份 `{"artStyles":…,"characters":[…],"backgrounds":[…],"titleCard":{"prompt":…}}`（开启结尾图时另加 `"endCard":{"prompt":…}`），存为 `design.json` 并登记 `"design":"design.json"`。预设的“语音”不是“无”时（`options.voicePortraits:true`），packet 会要求 `voices`：为旁白、其他人物和每个有台词的人物写声音画像。正文还没有简介时 packet 会要求 `blurb`：读正文开头部分后按规则写，程序导出时写进正文；正文已有原书简介时不写。人物与地点取自正文（含后来揭示的名字与出现章数），并附 `visualProfiles` 中的原文外观。用户模式或输入已有导演稿时画风已固定，设计不得改写。要改设计时直接编辑该文件；已登记时 `--design-packet` 会拒绝运行。

然后取得章节输入，阅读后写 JSON，再登记到 `directors`：

```sh
node scripts/direct-vn.mjs "work/project.json" --packet ch01 --out "work/ch01-packet.txt"
```

命令检查已登记的导演稿；packet 带全书设计、已登记章节的设计与截至本章的人物资料。返回 characters 中的 face／body，程序负责组装立绘提示词及画风。画风已由设计、前章或用户固定时省略 artStyles；没有全书设计的模型模式由第一章返回画风，其余章节等它登记后再写；程序标准化时补入画风和 generation。人物输出用 characterId，背景用 locations 数组。完整字段以 packet 及 [v13](../../../docs/director.md) 为准。

每章执行“取得 packet → 保存原始 JSON → 登记 directors → 校验”；有全书设计时各章可并发。可运行 `node scripts/direct-vn.mjs "work/project.json" --jobs --out "work/jobs.json"` 校验已登记稿并查看各章导演状态；尚缺后章时显示 pending，不能据此称全书导演完成。章节 JSON 的 `designConflicts`（`[{"entityId","unit","note"}]`：本章原文与输入的人物设计或地点主图矛盾之处）不进入阅读稿，在导演状态中逐章列出；核实后改设计文件再重新校验。所有选定章齐备后运行下方导出及 strict 检查；成品导出要求所选章全部通过。修订另存版本，原始返回与实际请求保留在制作目录。

目标章节齐备后交付：

```sh
node scripts/direct-vn.mjs "work/project.json" --out "work/story.vn.txt"
npm run validate -- "work/story.vn.txt" --strict
```

## 按生图预设改写

制作预设挂载了生图预设、且预设写了改写要求时，导演稿全部登记后改写提示词，生图时管理器直接发送改写稿：

```sh
node scripts/format-prompts.mjs "work/project.json" --list
node scripts/format-prompts.mjs "work/project.json" --packet <预设ID> --max 40 --out "work/format-<预设ID>.json"
node scripts/format-prompts.mjs "work/project.json" --apply <预设ID> "work/format-<预设ID>-out.json"
```

`--list` 列出生图方案用到的预设与各自待改写的条数。packet 给出 `notes`（改写要求）和 `items`（`key`、这张图的画幅 `ratio` 与程序组装好的 `prompt`；`#edit` 结尾的是差分的编辑指令）。按 `notes` 逐条改写：画面内容、人物特征、画风与用途要求照原样保留，只改语言、结构与写法；写法要求写明画幅或比例时，照该条的 `ratio` 写（特写是 1:1、立绘是 2:3，不随作品的横竖屏）；编辑指令仍只写要改的部分。改写时，人物站位、姿态与空置区域一律用正向空间表达（不写“不是站着”之类否定句，以免模型多画人），遇到生僻或特定地区／年代的器物、服饰、建筑构件与专有名词（不限国家与文化）展开写出具体外形、结构与材质。返回 `{key: 改写后的提示词}` 的 JSON，`--apply` 保存；重复 packet 直到没有待改写项。用户手动改过的提示词不出现在 packet 里。立绘条目带 `keep`（取景句，`en` 英文、`zh` 中文两组）：按改写稿的语言选一组，每句逐字保留，不要换成别的说法或并进其他句子；描述里如果写了鞋袜、脚的位置或重心，改写时删去，它们会把画面拉成全身。立绘的透明背景说法由预设的透明写法在发送时补上，改写时不用加。CG 条目带 `cast`（`@1`–`@3` 各是谁及其外观）：改写时原样保留这些标记，人物说明由程序在发送时补上，不要把外观写回画面描述。改写要求或导演稿变了，相应条目会重新出现在 packet 里；要全部重做时加 `--all`。

目录中的清单、独立 JSON、图片和简短制作笔记即可续跑。随时可运行 `node scripts/work-status.mjs "works/<作品>"` 一次查看转换、导演、未解决 `designConflicts`、待改写提示词、生图、立绘头像裁切、语音、音乐与音效的完整进度。`vn-agent-director-1` 是本地文件清单；以成品 `.vn.txt` 为 input 新建清单即可在已有导演结果上续作。

保持输入文件独立；新结果写新路径。全书换画风时先从原稿移除非 document 字面内容的 Director 注释（复用 `ScriptDirector.baseRaw`），另建制作目录与清单，再写全部新导演稿；旧成品保留。仅改某条提示词且画风不变时，直接提供该章完整替代 JSON。


CG 每条 `{id,from,to,reason,cast,prompt}` 由模型按场面与阅读节奏选择画面和起止单元，`cast` 列画面里的主要人物（最多 3 人，各写 `look`），`prompt` 用 `@1`–`@3` 指代他们，不要求 evidence，可在描写展开时出现并覆盖连续多格；只复制输入单元 ID，不猜编号。完整约束见 [Director](../../../docs/director.md#cg) 与 [格式规范](../../../docs/format.md#cg)。

差分（`characterVariants`／`locationVariants`，默认关闭）见 [variants](../../../docs/variants.md)；六格表情已移除。
