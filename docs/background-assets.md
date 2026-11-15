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
```

包内所有图片均以其字节内容的 `SHA-256` 十六进制摘要命名，相同图片在同类资产中自动去重。作品包仅包含成品剧本、人物资料、导演记录与图像资产，不包含原书文件、制作过程草稿、API 密钥或个人阅读进度。

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
- 体积限制：`story.vn.txt` 上限 `10 MiB`，`manifest.json` 上限 `16 MiB`，`extra.json` 上限 `8 MiB`。

---

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
