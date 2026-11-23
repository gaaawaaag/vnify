# 剧本格式规范（`@vn 0.10`）

`.vn.txt` 是 vnify. 使用的纯文本线性视觉小说脚本格式。文件包含正文结构、原文来源映射，以及可选嵌入在文件尾部注释区的人物资料、世界词条与导演演出记录。

---

## 文件结构与基础语法

一份完整的 `.vn.txt` 脚本按顺序由以下部分组成：

1. **版本声明**：首行固定为 `@vn 0.10`
2. **书籍与实体声明**：`@book`、`@character`、`@location`
3. **章节与内容块**：`@chapter` 及其下的 `@scene`、`@narration`、`@document`
4. **尾部扩展容器（可选）**：作品简介（`// @vn-blurb`）、人物资料（`@dossier 2`）、导演记录（`// @vn-director`）、封面描述（`// @vn-title-card`）、结尾图描述（`// @vn-end-card`，写法同封面），以及音乐（`// @vn-music`）、环境音与音效（`// @vn-sounds`）、音色（`// @vn-voices`），后三项格式见 [背景与作品包资产](background-assets.md#音乐)

### 语法约定

- **指令行**：所有 `@` 指令独占一行，参数格式为 `key=value`。值包含空格或特殊字符时使用英文双引号包裹，字符串内的双引号转义为 `\"`，反斜杠转义为 `\\`。
- **标识符（ID）**：以英文字母开头，仅包含英文字母、数字、下划线（`_`）与连字符（`-`）。`none` 与 `guest` 为保留关键字，不可作为实体或内容块 ID。
- **注释行**：以 `//` 开头的独立行为注释。以 `// @vn-` 或 `// @source-use` 开头的注释行承载分屏、过渡、注解、来源去向及扩展容器数据。

### 结构示例

```text
@vn 0.10
@book demo title="雨夜旧站" author="林川"
@character lin label="林舟" color="#79b9ae"
@location old_station label="旧车站"

@chapter ch01 title="第一章 启程"
// @vn-note {"id":"n01","text":"旧站建于二十世纪初，现已停用。","source":["p000001"]}

@scene s01 loc=old_station time="傍晚"
@source p000001
晚风掠过{{note:n01|旧站台}}，{{lin|林舟}}停下了脚步。
@source p000002
[lin] 这里就是人们常说的那个旧站了。
[lin|心声] 比记忆中还要冷清。
[guest|站务员] 末班车已经开走了。

@narration s02
@source p000003
站务室里，信号记录还摊在桌上。
远处的信号灯闪烁着微光。

@document d01 style=message
@source p000004
@text
林舟：

明早八点，请在旧站候车室等候。

站务室
@enddocument
```

---

## 书籍、实体与章节声明

声明位于正文内容块之前，实体 ID、初始称呼与颜色在全书范围内固定：

- **书籍信息**：`@book <书籍ID> title="书名" [author="作者"] [lang=zh/zh-Hant/en/ja]`
  - `author` 为可选项，支持填写单人或多人署名。
  - `lang` 为作品语言：`zh`（简体中文，省略时的默认值）、`zh-Hant`（繁体中文）、`en`（英文）或 `ja`（日文）。正文、称呼与章节名都用这一语言书写。
- **人物声明**：`@character <人物ID> label="初始称呼" color="#RRGGBB"`
  - `label` 为该人物首次登场时读者可知的称呼。
- **地点声明**：`@location <地点ID> label="地点名称"`
  - 可使用 `区域·子地点`（如 `古宅·书房`）标识层级空间。
- **章节声明**：`@chapter <章节ID> title="章节标题"`
  - 所有内容块均须位于某个 `@chapter` 之下。

---

## 内容块

正文由三种内容块承载，块 ID 在全书范围内唯一。每个内容块内部按 **块起始指令 → `@source` → 其他状态指令 → 正文行** 的顺序编写，且至少包含一个正文单元。

| 指令 | 适用内容 | 参数 |
| --- | --- | --- |
| `@scene` | 发生在具体地点的行动与交谈 | `@scene <块ID> [loc=地点ID] [time="时段"] [pov=人物ID\|none] [effect=none\|memory\|dream] [title="显示名"]` |
| `@narration` | 跨时空叙述、时间过渡、议论或无具体地点的描写 | `@narration <块ID> [effect=none\|memory\|dream]` |
| `@document` | 需要整体排版的信件、公文、报刊、题记或诗歌 | `@document <块ID> [style=message\|verse] [effect=none\|memory\|dream]` |

### 场景地点沿用

未指定 `loc` 的现实场景（`effect=none`）自动沿用前一个现实场景的地点（可跨章节）。带有 `effect=memory` 或 `effect=dream` 的场景省略 `loc` 时不沿用前一场景地点，也不改变后续现实场景沿用的地点。

`title` 是可选的场景显示名：进入场景时的提示与画面上的地点标签优先显示它，未写时显示地点名。转换稿通常不写。

### 文档块（`@document`）

`document` 将整篇引用作为一个独立的阅读单元（单元 ID 为 `<块ID>:1`）：
- `style=message`（默认）：适用于信件、电报、日记、报刊、告示等段落文本。
- `style=verse`：适用于题记、献词、诗歌与短引文，保留原分行与缩进。

`document` 块在 `@source`（及可选的 `@reveal`）之后，以独占一行的 `@text` 开始正文，以独占一行的 `@enddocument` 结束：
- `@text` 与 `@enddocument` 之间的内容保留原始段落、空行与缩进。
- 内部的 `@`、`//`、`[标签]` 与 Markdown 符号均视为普通文本。
- 支持使用 `{{人物ID|称呼}}` 标记人物提及，以及 `{{note:ID|词语}}` 引用原书注解。
- 字面量 `{{` 转义为 `\{{`；正文中独占一行的 `@enddocument` 转义为 `\@enddocument`。

示例见 [examples/documents.vn.txt](../examples/documents.vn.txt)。

---

## 正文单元与状态指令

### 正文行类型

在 `scene` 与 `narration` 中，每个非空正文行构成一个阅读单元（单元 ID 按块内顺序编号为 `<块ID>:1`、`<块ID>:2` 等）：

- **旁白**：直接书写正文文本。
- **人物对白**：`[人物ID] 台词内容`
- **人物心声**：`[人物ID|心声] 心理活动内容`
- **非实体说话人（Guest）**：`[guest|称呼] 台词内容` 或 `[guest|称呼|心声] 心理活动内容`
  - 用于无需建立独立档案的临时人物（如路人、店员）。`称呼` 最多 300 字，可包含空格，不可包含 `|` 或方括号。示例见 [examples/guest-dialogue.vn.txt](../examples/guest-dialogue.vn.txt)。
- **行内人物提及**：`{{人物ID|原文称呼}}`
  - 用于正文中出现的姓名、称谓或绰号，关联至已声明的人物 ID。字面量 `{{` 写作 `\{{`。若行内标记引用了已声明的地点 ID（如 `{{old_station|车站}}`），解析器自动退化为普通文字显示。

### 状态指令

状态指令位于内容块内部、对应正文行之前：

- **来源绑定**：`@source <来源ID>[,来源ID2...]`
  - 将后续正文行绑定至原书段落编号，在同一内容块内持续有效，直至下一条 `@source` 指令；切换内容块后需重新声明。若 `@source` 紧邻下一个内容块起始指令（中间仅有空行或普通注释），解析器可将其归入该新块。
- **单句视觉效果**：`@effect next <memory|dream>`
  - 仅作用于紧随其后的单个阅读单元（如在现实场景中短暂引述一句过去的原话）。
- **人物改名与公开**：`@reveal <人物ID> [label="新称呼"]`
  - 更新人物在后续正文与档案中的公开显示名称，或在人物尚未通过正文出场时提前公开。

### 原文分隔符与来源去向

- **段落分隔过渡**：`// @vn-transition source=p000002`
  - 对应原书中的独立星号行或空行分隔，置于上一内容块之后、下一内容块之前。
- **非正文来源去向**：`// @source-use <来源ID> kind=<excluded|chapter|annotation> [target=章节ID] reason="说明"`
  - 交代不直接生成叙事正文的原书编号去向（如书外序跋 `excluded`、独立章节标题行 `chapter`、独立原注段落 `annotation`），保证原书来源 100% 覆盖。`kind=chapter` 须用 `target` 写明所属章节。

---

## 人物公开与资料容器

### 人物公开机制

人物默认处于未公开状态，当正文中首次出现该人物的对白 `[ID]`、心声 `[ID|心声]`、行内提及 `{{ID|称呼}}` 或 `@reveal ID` 指令时，该人物在该阅读单元正式公开。仅仅声明 `@character` 或将其设为场景 `pov` 不会公开人物。示例见 [examples/automatic-publication.vn.txt](../examples/automatic-publication.vn.txt)。

### 人物资料与世界词条（`@dossier 2`）

人物资料与世界观词条可嵌入在 `.vn.txt` 文件尾部的专用注释区内，随阅读进度解锁：

```text
// @vn-dossiers-begin
// @dossier 2
// @intro lin summary="旧站的值班员。"
// @after s01
// @person lin fullName="林舟" group="旧站"
// @entry lin duty text="负责保管旧站的信号记录。" category=background importance=core
// @entry lin past text="曾在总站做过信号员。" category=background importance=support
// @term signal_log label="信号记录" aliases="信号簿" summary="记录列车进出站与道岔状态的表册。"
// @vn-dossiers-end
```

- **首次简介**：`@intro <人物ID> summary="一句话简介"`，在人物首次公开时即刻生效，每人一条。
- **按块解锁**：`@after <块ID>`，其后的资料变更在读者读完指定内容块并进入下一块时生效（若为全书最后一块，则在读完末句后生效）。
- **基本信息更新**：`@person <人物ID> [fullName="完整姓名"] [summary="更新简介"] [group="所属分组"]`。
- **详情条目**：`@entry <人物ID> <条目ID> text="内容" category=<alias|relation|background> importance=<core|support> [target=关联人物ID] [replaces=旧条目ID]`。同条目 ID 会覆盖更新原条目；`@remove <人物ID> <条目ID>` 可移除过时条目。
- **世界词条**：`@term <词条ID> label="正文写法" [aliases="别名1|别名2"] summary="释义"`。阅读器在正文中自动匹配词条名称与别名，从首次出现处起提供悬停释义并收入词条面板。

---

## 作品简介 `// @vn-blurb`

可选，全书最多一行，放在尾部扩展容器中：`// @vn-blurb {"text":"简介正文"}`。`text` 为纯文字，可用 `\n` 分段，不超过 2000 字。标题画面在书名与作者下方显示简介；没有这一行时不显示。原书自带简介（如 EPUB 的 description）时照录原书；书架的“编辑信息”可以修改或清空它。

## 分屏 `// @vn-page`

`scene` 与 `narration` 每行一屏。`// @vn-page` 是旧写法的分屏标记：独立一行标记一个句群的起点，到下一个 `// @vn-page` 或内容块结束为止。制作时不写这个标记；解析器读取并检查它，播放器不按它分屏（“逐句分屏”每行一屏，“按原文自然段”按来源分组）。规则如下：

- 同一屏内的各行需保持正文类型（旁白／对白／心声）、说话人、公开称呼与视觉效果一致；中途发生变化时自动从变化行起另起新屏。
- **短句自动并屏**：未处于显式 `// @vn-page` 句群内、去除标点后不足 5 个字的超短句（如“啊！”“怎么会？”），若与同一自然段（共享 `@source`）的相邻句同属一个内容块、同类型、同说话人且同效果，解析器会自动将其合并为同屏逐句追加（每屏最多合并 3 个单元）。

示例见 [examples/pages.vn.txt](../examples/pages.vn.txt)。

---

## 原书注解

原书中的作者注、译者注或页末注释通过 `// @vn-note` 定义，并在正文对应词语处通过行内锚点引用：

```text
// @vn-note {"id":"b001_n01","text":"译者注：白塔建于十七世纪。\n现存遗址位于城北。","source":["p000002"]}
@scene b001_s01
@source p000001
他望着{{note:b001_n01|白塔旧址}}，久久没有说话。
```

- **定义**：`// @vn-note` 后接单行 JSON，包含唯一的 `id`、保留原始段落（换行用 `\n`）的纯文本 `text`，以及原注所在的来源编号数组 `source`。定义可置于 `@document` 外部的任意独立行（通常放在章节开头）。一个注解 ID 只定义一次，可被正文多处引用。
- **行内引用**：写作 `{{note:注解ID|被解释词语}}`。若被解释词同时是人物提及，写作 `{{人物ID|称呼|note:注解ID}}`，同时保留人物公开、染色与注解查看。

示例见 [examples/annotations.vn.txt](../examples/annotations.vn.txt)。

---

## CG

事件 CG 不在正文中插入占位指令，而是由导演记录与背景资产清单共同定义：

1. **演出区间记录**：在文件尾部的 `// @vn-director` 记录中，通过 `cgs: [{"id": "ch01.cg01", "from": "s01:2", "to": "s01:5", "reason": "...", "prompt": "..."}]` 指定 CG 覆盖的起止阅读单元 ID（含首尾）。详见 [导演与配图规范](director.md#cg)。
2. **图像资产绑定**：在作品包的背景资产清单 `bindings.cgs` 中，将 CG ID 绑定至具体图像文件摘要。详见 [背景与作品包资产](background-assets.md)。

阅读进度进入 `[from, to]` 区间时，播放器展示对应 CG 并隐藏前景立绘；离开区间后恢复当前场景背景。示例见 [examples/cg.vn.txt](../examples/cg.vn.txt)。
