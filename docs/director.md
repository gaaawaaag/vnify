# 导演与配图规范（Director v13）

导演阶段在正文与人物资料验收后按章执行，负责规划全书美术风格、作品封面、氛围背景、地点背景、人物立绘、事件 CG、特写插图（Cut-in）以及差分与出场状态记录。命令行工具与本地资产管理器随后将这些画面描述与画风、构图模板组装为生图任务，完成配图与作品包绑定。

---

## 工作流程

1. **全书视觉设计（`design.json`）**：根据正文人物、地点与转换阶段整理的原文外观（`visual-profiles.json`，人物与地点各一条，原文没有外观描写时为 `[]`）生成全书设计，确定背景与人物两条画风、作品封面（`titleCard`）、主要人物默认外貌、常用地点主图、反复使用的氛围图及可预见的差分定义。开启结尾图（`endCard:true`）时另写结尾图描述（`endCard`，导出时写成 `// @vn-end-card` 记录，生图任务 `end-card`，画幅同封面）。正文还没有简介（原书没有自带）时，设计另写作品简介（`blurb`：交代故事前提、不剧透），导出时写成 `// @vn-blurb` 记录。
2. **分章导演规划（`directors/<章节ID>.json`）**：按章规划本章使用的氛围背景、地点背景、新增或更新的人物外貌、CG 区间、特写插图、局部差分与实体状态记录。通过校验后，标准化记录写入 `.vn.txt` 文件尾部的 `// @vn-director` 与 `// @vn-title-card` 注释行。
3. **生图任务与绑定（`--jobs`）**：工具汇总全书缺图任务（含文生图提示词、参考图提示词与差分编辑提示词），由 Agent 生图工具或本地资产管理器生成图像并绑定至 `.vn.zip` 作品包。

完整的制作命令与清单配置见 [vn-director 技能说明](../skills/vn-director/SKILL.md)。

---

## 导演配置项（`directorOptions`）

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `backgrounds` | `true` | 环境类图像（封面、氛围图、地点背景、CG）总开关 |
| `ambients` | `true` | 氛围背景开关；全书复用，每章指定一张默认氛围图 |
| `locationBackgrounds` | `true` | 地点主图开关；开启时本章每个内容块均须归入某条 `backgrounds[].blocks` 或 `omittedBlocks` |
| `cgs` | `true` | 事件 CG 开关；受 `backgrounds` 总开关控制，采用人物画风 |
| `cutIns` | `false` | 细节特写插图开关，详见 [特写插图规范](cut-ins.md) |
| `standing` | `true` | 人物立绘开关；每个形象生成一张 `2:3` 透明立绘，对话框头像从立绘自动裁切 |
| `characterVariants` / `locationVariants` | `false` | 人物差分与地点差分开关，详见 [差分与状态记录](variants.md) |
| `density` | 适中（特写与差分为少量） | 各资产种类的疏密档位（`few` / `medium` / `rich`），包含 `ambients`、`locations`、`cgs`、`cutIns`、`characterVariants`、`locationVariants` |
| `ratio` | `"16:9"` | 背景、氛围图与 CG 的画面比例（横屏 `16:9` / `3:2` / `4:3`，竖屏 `9:16` / `2:3` / `3:4`）；特写固定为 `1:1`，立绘固定为 `2:3`，封面随横竖屏取 `16:9` 或 `2:3` |
| `subjectFormat` | `""` | 旧字段：画面主体描述的格式要求。制作预设已不再生成（模型写法改由生图预设负责，见 [prompt-formats](prompt-formats.md)），旧清单里的仍会读取 |
| `imageLimit` | 无 | 可选的全书图片总数上限（汇总所有新增图像种类，复用不重复计数） |
| `styleModes` | `{"background":"model","character":"model"}` | 背景与人物画风的来源模式：`model` 由导演决定，`expand` 由导演根据用户给出的方向扩写，`fixed` 直接使用用户填写的固定画风提示词 |
| `endCard` | `false` | 可选结尾图开关；开启时由全书设计写出 `endCard` 描述，生成与封面同画幅的结尾卡片背景 |
| `voicePortraits` | `false` | 声音画像开关；开启时全书设计为旁白、其他人物及有台词的人物写出声音画像（`voices`） |
| `musicTracks` / `musicDensity` | `false` / `"medium"` | 音乐曲目表开关与数量档位（`few` / `medium` / `rich`）；开启时全书设计写出曲目表（`music`） |

---

## 画风管理

作品包含两条独立画风，分别在对应的生图任务中拼入一次：
- **背景画风（`artStyles.background`）**：用于氛围背景、地点背景与特写插图（Cut-in）。
- **人物画风（`artStyles.character`）**：用于人物立绘、事件 CG 与作品封面。

当来源模式为 `model` 或 `expand` 时，由全书设计（或首个章节导演请求）生成画风并在全书范围内锁定沿用；当来源模式为 `fixed` 时，程序直接使用用户配置的画风文本。

---

## 章节导演数据结构

```json
{
  "version": 13,
  "chapterId": "ch1",
  "artStyles": {
    "background": "Monochrome ink wash, soft paper textures.",
    "character": "Soft painted illustrations, warm natural colors."
  },
  "ambients": [
    {"id": "ch1.ambient01", "name": "雨夜微光", "prompt": "Soft paper textures around a faint warm lantern light in the rain."}
  ],
  "ambient": "ch1.ambient01",
  "ambientBlocks": [],
  "backgrounds": [
    {"locations": ["yard"], "blocks": ["s1"], "prompt": "An old stone courtyard after rain, wet eaves and moss."}
  ],
  "omittedBlocks": [],
  "characters": [
    {
      "characterId": "lin",
      "face": "A young man in his twenties with short black hair, calm dark eyes, and a plain blue collar.",
      "body": "Wearing a blue cotton shirt with rolled sleeves and dark trousers, standing angled slightly to the right with one hand holding a lantern."
    }
  ],
  "cgs": [
    {"id": "ch1.cg01", "from": "s1:2", "to": "s1:3", "reason": "关键重逢场面。",
     "cast": [{"id": "lin", "look": "A young man with short black hair, in a blue cotton shirt with rolled sleeves."}],
     "prompt": "@1 stops at the courtyard gate with a lantern raised, looking at the open door. Dusk, wet stones."}
  ],
  "cutIns": [],
  "cutInUses": [],
  "variants": [],
  "states": []
}
```

### 氛围背景（`ambients`）

- `ambients` 定义本章首次登场的可复用氛围图 `{id, name, prompt}`，`id` 全书唯一，`name` 用于图集展示。
- `ambient` 指定本章默认氛围图的 ID；`ambientBlocks: [{"ambient": "<ID>", "blocks": ["<块ID>"]}]` 可为本章特定内容块单独指定氛围图。
- 后章复用已有氛围图时直接填写其 ID。

### 地点背景（`backgrounds`）

- 每条地点背景 `{locations, blocks, prompt}` 可关联一个或多个地点 ID（例如将同一建筑内的次要子区域归入同一张主图），`blocks` 列出本章使用该图的场景块。
- 地点主图跨章复用：后续章节出现同一地点时沿用首次定义的 `prompt`。
- 阅读时的背景匹配顺序为：**地点差分图 → 地点主图 → 内容块氛围图 → 章节默认氛围图 → 作品默认背景**。

### 人物立绘设计（`characters`）

人物外貌拆分为两部分，由程序与画风、构图模板组合为 `2:3` 立绘提示词（头顶至大腿中部的 cowboy shot）：
- `face`：头部与面部特征，包含年龄感、五官、发型、发色、肤色、头饰及衣领细节。
- `body`：肩部至大腿中部的服装与配饰，不写膝盖以下的腿、脚与鞋袜，并在末尾说明站姿（默认身体大致向画面右侧四分之三侧身，交代侧转幅度、头部角度与自然动作，不写脚的位置或重心）。
- `stature`（可选）：取值为 `0.7`–`1.1`（普通成人默认为 `1`），用于儿童或身高显著特殊的人物，控制舞台立绘的缩放与站位高度。

每章仅需登记本章新增的已公开人物，后续章节按人物 ID 沿用设计。服装更换、受伤或年龄跨度等变化通过人物差分表现。

### 设计与原文的出入（`designConflicts`）

章节导演沿用已有人物设计与地点主图；本章原文对某个人物或地点有明确的外观描写、与设计矛盾时，记一条 `{entityId, unit, note}`（`unit` 为写到这处描写的本章单元，`note` 写原文与设计各自的写法）。这些记录只是制作备注，不写入阅读稿；`--jobs` 在各章导演状态中列出，核实后修改设计文件。

### CG

每条 CG 记录格式为 `{id, from, to, reason, cast, prompt}`：
- `id` 以 `<章节ID>.` 开头且全书唯一。
- `from` 与 `to` 为同章内的起止正文单元 ID（含首尾），同一章内多条 CG 的区间互不重叠。
- `cast` 列出画面中的主要人物 `{id, look}`，最多 3 人，按画面中的分量排列；画面里没有人物时为 `[]`。`look` 是该人物在这张图里看得到的外观（年龄观感、发型发色、五官、当时的衣着）。生图时这些人物的立绘可按顺序作为参考图附上（见[提示词写法](prompt-formats.md#cg-的出场人物)）。
- `prompt` 为画面描述：用 `@1`、`@2`、`@3` 依次指代 `cast` 中的人物，每人至少出现一次，写清各自的位置、动作、表情与彼此关系；`cast` 之外的人物直接写外观；再写环境、镜头与光影。阅读进度处于 `[from, to]` 期间，CG 覆盖当前背景并隐藏前景立绘。
- 不写 `cast` 的记录也有效，此时 `prompt` 是包含人物外观的完整描述，生图时不附人物参考图。

### 差分与状态记录（`variants` / `states`）

- `variants` 定义本章首次使用的人物或地点差分。
- `states` 记录实体在指定正文范围内的差分状态（`variant`）与人物舞台在场状态（`present`）。
- `stages`（开启人物立绘时可写）为镜头区间 `{from, to, cast}`：一段画面上只站 `cast` 中的 0—3 个人物。加 `join:true` 时 `cast` 只是上场并站到前面，台上原有的人保留。旁白描写在场人物（本场有台词；本场无人说话时为本场提及的人物）外貌的位置，程序按转换阶段的外观摘录自动加入带 `auto:true` 的区间（描写较长时独占舞台，较短时为 `join`），与导演写的区间重叠时让位。
- 完整数据结构、持续与区间规则见 [人物与地点差分](variants.md)。

---

## 生图任务组装与透明处理

工具根据导演记录自动生成待办图像任务列表（`--jobs`）：
- **提示词组装**：自动将画面描述与对应画风、构图要求（如立绘的 `image11.standing` 模板、特写的 `image11.cut-in` 模板）拼接为完整提示词。若任务关联了参考图，同时生成带参考说明的 `referencePrompt`；差分任务同时提供基于默认图的 `editPrompt` 与完整文生图 `prompt`。
- **立绘透明背景**：
  - `transparencyMethod: "native"`（默认）：提示词包含透明背景要求，由生图模型直接输出带透明通道的 `2:3` PNG/WebP。
  - `transparencyMethod: "cutout"`：提示词要求生成纯色背景，生图后由 `scripts/cutout.mjs` 或模型去背工作流自动去除背景并保留边缘半透明过渡。

---

## 校验要点

程序登记导演记录时会拒绝以下情况，原稿保留供修复或重试：

- 关闭的用途对应数组不为 `[]`（氛围背景关闭时 `ambients`／`ambientBlocks` 为 `[]` 并省略 `ambient`）。
- 人物条目缺少 `face` 或 `body`（无额外细节时 `body` 写 `""`）；`face`／`body` 不写画风、比例、透明方式或表情，这些由程序模板提供。
- 人物尚未在本章或前文公开（本章之前出现过的 POV 人物除外）。
- 地点背景未覆盖本章块、地点重复归入多张图，或 CG／Cut-in 区间越出本章、互相重叠。
- 改写已发布章节的导演记录：后章只能追加。

播放器导入作品时同样校验全部导演记录，损坏数据不会替换当前作品。
