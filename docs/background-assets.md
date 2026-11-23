# 背景与作品包资产规范

vnify. 的图像资产与绑定关系独立于 `.vn.txt` 正文脚本维护，在导出 `.vn.zip` 作品包时与剧本、人物资料、导演记录及原书附录一同封装。

---

## 背景资产清单与匹配规则

背景资产清单（`backgrounds`，版本 `8`）通过稳定 ID 将作品中的环境、事件与特写绑定至具体图像：

```json
{
  "version": 8,
  "bookId": "demo",
  "bindings": {
    "book": null,
    "titleCard": "a1b2c3...",
    "endCard": null,
    "ambients": {"ch1.ambient01": "d4e5f6..."},
    "locations": {"old_station": "789abc..."},
    "cgs": {"ch1.cg01": "def012..."},
    "cutIns": {"brass-key": "345678..."},
    "variants": {"old_station.night": "9abcde..."}
  },
  "images": {
    "a1b2c3...": {
      "path": "assets/backgrounds/a1b2c3....webp",
      "name": "cover.webp",
      "type": "image/webp",
      "width": 1600,
      "height": 900
    }
  }
}
```

### 背景显示与回退顺序

在阅读正文时，播放器按以下优先级确定当前单元的背景图像：

1. **事件 CG（`cgs`）**：当前单元处于某条 CG 的 `[from, to]` 区间内时，优先显示该 CG 并隐藏前景立绘。
2. **地点差分（`variants`）**：当前场景具有有效地点，且状态记录指定了地点差分时，显示对应的地点差分图（阅读设置关闭“显示差分”时跳过）。
3. **地点主图（`locations`）**：显示当前场景 `loc`（含沿用地点）绑定的地点主图。同一地点在不同章节自动复用。
4. **内容块氛围图（`ambients`）**：当前内容块在导演记录的 `ambientBlocks` 中单独指定了氛围图时，显示该氛围图。
5. **章节默认氛围图（`ambients`）**：显示当前章节 `ambient` 指定的默认氛围图。
6. **作品默认背景（`book`）**：回退至作品级默认背景；未绑定时使用阅读器默认底色。

特殊内容块的背景规则：
- **`@document`**：沿用脚本顺序中前一个正文单元实际显示的背景；若位于章节开头无前文，则从章节氛围图／作品背景回退。
- **无 `loc` 的回忆／梦境场景与 `@narration`**：直接从氛围图层级（第 4 步）开始回退，不沿用前一个现实场景的地点背景。
- **作品封面（`titleCard`）**：专用于进入作品时的标题画面与书架封面展示，不参与正文背景回退。详见 [导演与配图规范](director.md)。
- **结尾图（`endCard`，可选）**：读完全书时结尾卡片的背景，清晰显示并略微压暗，不参与正文背景回退；省略或为 `null` 时用模糊压暗的作品封面。制作时在预设中打开“结尾图”，由全书设计写描述。

---

## 角色图片清单

角色图片清单（`characterImages`，版本 `5`）按人物 ID 记录默认立绘（`standing`）与各差分形象立绘（`variants`）：

```json
{
  "version": 5,
  "bookId": "demo",
  "bindings": {
    "lin": {
      "standing": {
        "imageId": "112233...",
        "flip": "right",
        "crop": {"x": 192, "y": 40, "size": 640}
      },
      "variants": {
        "lin.injured": {
          "imageId": "445566..."
        }
      }
    }
  },
  "images": {
    "112233...": {
      "path": "assets/characters/112233....webp",
      "name": "lin.webp",
      "type": "image/webp",
      "width": 1024,
      "height": 1536
    }
  }
}
```

- **立绘与头像裁切**：每个形象使用一张 `2:3` 透明背景立绘（头顶至大腿中部的 cowboy shot），共用于舞台立绘、对话框头像、演员表（Cast）与人物详情页。对话框头像从同一张立绘裁出：若配置了方形裁切框 `crop: {x, y, size}` 则按裁切框显示，省略时自动按头肩比例截取。
- **镜像翻转（`flip`）**：可选 `"right"`（默认，人物立绘站于舞台右侧时水平镜像翻转）、`"left"` 或 `"none"`。

---

## 图像格式与尺寸规格

- **文件格式**：支持静态 `PNG`、`JPEG`、`WebP`。在资产管理器或制作流程中打包导出时，默认将图片转为同尺寸有损 `WebP`（质量 85–90，透明立绘完整保留 alpha 通道）以减小分发体积。
- **尺寸与体积上限**：
  - 单张图片文件大小不超过 `20 MiB`。
  - 单边像素不超过 `8192`，总像素不超过 `33,554,432`（支持 `3840×2160` 4K 分辨率）。
  - 每类资产清单最多容纳 `4096` 张独立图片。

---

## 作品包格式（`.vn.zip` v13）

`.vn.zip` 是用于分发、备份与跨端导入的单文件作品包，采用标准 `STORE`（不二次压缩）ZIP 封装，最大支持 `4 GB`。

### 目录结构

```text
<作品ID>.vn.zip
  manifest.json
  story.vn.txt
  extra.json                                  （可选，含原书附录或插图时存在）
  assets/backgrounds/<SHA-256>.png|jpg|webp   （背景、封面、CG、特写与地点差分图片）
  assets/characters/<SHA-256>.png|jpg|webp    （人物默认立绘与差分立绘）
  assets/extra/<SHA-256>.png|jpg|webp         （可选，EPUB 原书插图与封面）
  assets/audio/<SHA-256>.mp3|m4a|ogg          （可选，音乐）
```

包内所有图片与音频均以其字节内容的 `SHA-256` 十六进制摘要命名，相同文件在同类资产中自动去重。作品包仅包含成品剧本、人物资料、导演记录与图像资产，不包含原书文件、制作过程草稿、API 密钥或个人阅读进度。

### `manifest.json` 结构

```json
{
  "format": "vn-package",
  "version": 13,
  "bookId": "demo",
  "script": "story.vn.txt",
  "complete": true,
  "extra": "extra.json",
  "backgrounds": { "...": "背景资产清单（version 8）" },
  "characterImages": { "...": "角色图片清单（version 5）" }
}
```

- `complete`：标识作品正文是否已包含至原书结尾（连载或分批试读稿可设为 `false`）。
- `extra`：存在原书附录或原书图片时为 `"extra.json"`，否则为 `null`。
- `audio`：有曲目绑定了音频文件时存在，见下文[音乐](#音乐)；没有时省略。
- `credits`（可选）：致谢记录 `{"version":1,"images":["生成所用的服务与模型"],"notice":"说明","signature":true}`。`images` 只列模型名、不计张数，来源不明的图片记为“用户提供”；`notice` 为作者写的说明（如“仅供学习用途”）；`signature` 为是否在致谢里写上 vnify.，缺省时写上。阅读器的“致谢”把它与正文和音频清单里已有的来源（原作、曲目与音效的作者和许可证、音色）合在一起显示。
- 体积限制：`story.vn.txt` 上限 `10 MiB`，`manifest.json` 上限 `16 MiB`，`extra.json` 上限 `8 MiB`。

---

## 音乐

### 音乐记录（`// @vn-music`）

正文中至多有一行音乐记录，与导演记录并列，解析器视为注释：

```text
// @vn-music {"tracks":[{"id":"rain","name":"雨夜","prompt":"Slow solo piano, rain on the window."}],"cues":[{"from":"s01:1","track":"rain"},{"from":"s04:2","track":null}]}
```

- `tracks`：曲目 `{id, name, prompt}`。`id` 全书唯一（字母、数字与 `_.-`，最多 64 字符），`name` 为显示名，`prompt` 为可选的生成描述。
- `cues`：切换点 `{from, track}`，按正文顺序排列。从 `from` 单元起播放 `track`（`null` 为静音），持续到下一个切换点，可以跨章；第一个切换点之前静音。
- 某一位置播放什么只由位置决定：跳读、回退或从中途打开都与顺读到该处相同。换曲时交叉淡入淡出，曲目循环播放。
- 曲目没有绑定音频文件时按静音处理，阅读不受影响。

### 音频清单（manifest `audio`）

```json
{
  "version": 1,
  "bindings": {"tracks": {"rain": "<SHA-256>"}},
  "files": {
    "<SHA-256>": {"path": "assets/audio/<SHA-256>.mp3", "name": "rain.mp3", "type": "audio/mpeg",
      "source": {"title": "Rain", "author": "…", "url": "https://…", "license": "CC0"}}
  }
}
```

- `bindings.tracks`：音乐记录中的曲目 ID 到音频文件；`bindings.sounds`（可选）：环境音与音效记录中的声音 ID 到音频文件。每个文件都须被某首曲目或某个声音使用。
- `type` 为 `audio/mpeg`（MP3）、`audio/mp4`（M4A／AAC）或 `audio/ogg`；文件头须与之一致，单个文件最大 `40 MiB`，全书最多 256 个。
- `source`（可选）：出处、作者、链接与许可证，随作品包分发；使用 CC-BY 等需要署名的素材时填写。

## 环境音与音效（`// @vn-sounds`）

正文中至多有一行环境音与音效记录，与导演记录并列，解析器视为注释：

```text
// @vn-sounds {"sounds":[{"id":"rain","name":"雨声","kind":"ambience","query":"rain on window loop"},{"id":"door","name":"开门","kind":"effect","query":"old wooden door creak"}],"places":{"inn":"rain"},"blocks":{"s05":null},"effects":[{"at":"s01:2","sound":"door","phase":"enter"}]}
```

- `sounds`：声音 `{id, name, kind, query, prompt}`。`kind` 为 `ambience`（环境音，循环）或 `effect`（音效，一次性）；`query` 是搜索音效库用的英文词，`prompt` 是生成用的描述，都可省略。
- `places`：地点 ID 到环境音，为该地点所有场景的默认环境音。
- `blocks`：内容块 ID 到环境音，个别块另指定；`null` 为这一块静音。
- 环境音的查找顺序：块的指定 → 地点的默认 → 静音；document 沿用前一个场景的地点。换环境音时淡入淡出。
- `effects`：音效点 `{at, sound, phase, volume}`，按正文顺序排列。`phase` 为 `enter`（进入这一句时）或 `shown`（这一句文字显示完后），默认 `enter`；`volume` 为 0–1，默认 1。音效只在顺着往前读到这一句时播放，回退与跳转不补播。
- 声音的文件在 manifest `audio.bindings.sounds` 中按声音 ID 绑定，与曲目共用文件清单与来源字段；没有文件的声音按无声处理。

## 音色（`// @vn-voices`）

正文中至多有一行音色记录，与导演记录并列，解析器视为注释：

```text
// @vn-voices {"labels":{"fish:54a5…":"沉稳旁白","fish:8e2f…":"温和青年男声"},"cast":{"narrator":"fish:54a5…","characters":{"lin":"fish:8e2f…"}},"portraits":{"lin":"二十多岁的男性，声音温和偏低"}}
```

- 音色写作 `<服务>:<音色 ID>`，支持 Fish Audio（`fish:`）、ElevenLabs（`elevenlabs:`）与 Gemini TTS（`gemini:`）；`labels` 给出显示名，只保留分派用到的音色。
- `cast`：`narrator` 为旁白，`other` 为没有名字的说话人和没有单独分派的人物，`characters` 按人物 ID 分派。没有分派的角色依次沿用 `other`、`narrator`，最后用阅读器的默认语音。
- `portraits`（可选）：角色（`narrator`、`other` 或人物 ID）的声音画像，供设计或挑选音色。
- 阅读器按这份分派朗读；用到某个服务的音色时，读者需要在阅读器设置里填入该服务的 key；没有 key 时改用浏览器语音。

## 原书附录与插图（`extra.json` v2）

转换 EPUB 或包含序跋的 TXT 原书时，书外材料与原书图片保存在独立的 `extra.json` 与 `assets/extra/` 目录中：

```json
{
  "version": 2,
  "items": [
    {"title": "译者序", "paragraphs": ["第一段正文……", "第二段正文……"]}
  ],
  "images": {
    "778899...": {
      "path": "assets/extra/778899....jpg",
      "name": "illus01.jpg",
      "type": "image/jpeg",
      "width": 1200,
      "height": 1600
    }
  },
  "illustrations": [
    {"imageId": "778899...", "after": "p000120"}
  ],
  "gallery": ["aabbcc..."],
  "cover": "aabbcc..."
}
```

- **书外文本（`items`）**：保存序言、导读、后记、人物表等非叙事原文（最多 64 篇，总文本上限 2 MB），在阅读菜单的“附录”面板中按篇展示。
- **正文内插图（`illustrations`）**：`after` 记录插图在原书中紧随其后的来源段落编号。阅读到该来源对应的首个正文单元直至该内容块结束期间，插图以 [Cut-in 特写](cut-ins.md) 的位置随行展示（优先于导演特写且不占用导演特写额度），并收录入图集的“原书图片”分类（读到前默认雾化）。
- **正文外图片（`gallery`）与原书封面（`cover`）**：收录于图集“原书图片”分类；当作品未单独生成 `titleCard` 封面，或在书架设置中开启“优先使用原书封面”时，直接使用 `cover` 展示。

---

## 书架存储与缓存

将 `.vn.zip` 或作品文件夹导入书架时，本地或云端服务会完整校验脚本语法、清单引用以及每张图片的文件头签名、尺寸与 SHA-256 摘要，随后解包存入书架数据目录（默认位于 `data/library/<作品ID>/package/`）。

打开作品阅读时，播放器首先加载 `manifest.json`、`story.vn.txt` 与 `extra.json`，图像文件按阅读进度通过各自的 SHA-256 地址按需读取并预取后续数句所需的图片，浏览器通过不可变（Immutable）缓存策略长期缓存已下载的图像。
