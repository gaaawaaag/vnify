# 制作文件与命令

所有命令在仓库根目录执行。工具只处理本地文件，不调用模型。正文和人物资料可由当前 agent 或宿主已有生成能力完成；普通转换无需配置模型 API，严格单次请求模式需要另有可用调用入口。

## 新任务与续跑

```sh
npm run number-source -- "input/novel.txt" --out "works/novel/convert"
```

命令创建 `source-numbered.txt`、`source-map.json` 和参考分批 `batches/`；输出目录须尚不存在，已存在时报错且不覆盖；重新编号时先把旧的 `convert/` 改名保留。作品目录 `works/<作品>/` 下放 `convert/`（本技能）与 `director/`（vn-director），资产管理器按此列出作品。默认按非空行编号；编码可用 `--encoding gb18030` 等选项指定。

输入为 `.epub` 时按书内阅读顺序取文字，每段一行编号（注音只留基字，DRM 加密直接报错），另生成：

- `epub.json`：`title`、`author`（全部 dc:creator，用“、”连接，可能为空）、`description`（原书自带的简介，去掉 HTML，可能为空）、`chapters`（原书目录转成的 `{start,title}`；指向单图页的目录条目不成章，标题作为图注）、`images`（原图元数据与 `images/` 下的文件）、`placements`（每张图位于哪个来源之后，正文前为 null）、`cover`、`skipped`（非 PNG／JPEG／WebP 或过大的图）。
- `images/`：原书图片（任一边小于 64 像素的字形／装饰图不收）。

EPUB 不接受 `--mode`、`--prefix`、`--start`、`--encoding`。参考分批按字符数切分，正式转换按章节和完整语义选择范围。原文全部保存在映射中，编号后保持该快照不变。

## 交接包

其他工具（如漫画转写 skill）交来的目录含 `text.txt`（1 起行号）、`refs/refs.json`＋参考图、`glossary.json`，可选 `handoff.json`（title、author、chapters:[{title,line}]、text 路径；refs／glossary 可直接内嵌为数组，或写文件路径）。用它代替 number-source：

```sh
node scripts/import-handoff.mjs "input/交接包目录" --out "works/作品/convert" [--highlights cg|extra]
```

输出目录须尚不存在。除 number-source 的三项外另生成：

- `handoff.json`：书名、作者、章节表（取自清单，否则取 `# ` 标题行）、全部参考图（行号已换成来源 ID）、`warnings`。章节表直接作为规划起点。
- `refs/`：参考图副本。高光图不放进场景：默认（`--highlights cg`）留在 refs/ 并列入 references.json，作为覆盖同一段正文的 CG 的构图参考；`--highlights extra` 时改放 Extra 图集（`images/`），图集不按阅读进度隐藏，含剧透的画面不要这样放。
- `visual-profiles.json`：按参考图 ID 把说明汇总进各条目的 `note`（参考图的说明，不是原文句子），非默认形象带“（stage）”前缀；登记时按原文补上 `look` 摘录。
- `terms.json`：词条。资料开启世界词条时作为 @term 的来源，名称按正文实际写法。
- `references.json`：交给 vn-director 的参考图清单（见其[生图与打包](../../vn-director/references/images.md)）。

登记人物与地点时沿用参考图的 `id` 作为稳定 ID（会提前暴露身份的除外，那时另起中性 ID 并在 references.json 改写 entityId）；aliases 用于对应正文称呼。`warnings` 中的问题（参考图偏小、缺默认形象等）告诉用户。合并清单写 `"handoff": "handoff.json"`（选了 extra 时打包带上图集）。

在同一制作目录保存：

- `project.json`：下述合并清单，只登记已写好的批次与资料。
- `notes.md`：开头的“制作方案”（交付结果、风格、资料模式、配图偏好与上限），之后是已读范围、稳定人物／地点登记、歧义、已验收范围、下一步与未解决问题。自定义风格正文也保存在这里或同目录文件中。
- `visual-profiles.json`（必交）：按稳定人物／地点 ID 收集原文的外观描写 `[{"id":"实体ID","look":[{"source":"来源ID","text":"原文摘录","when":"可选"}],"note":"可选"}]`，写法见 register 规则的“外观参考”：`text` 从该来源原样摘出，`when` 只在不是通常样子时写；用户指定或参考图说明的外观写在 `note`。原文没有外观描写的实体不列，全书都没有时写 `[]`。登记写完后运行 `node scripts/looks.mjs "<convert>" --out "<convert>/look-hints.txt"`，它对照编号原文列出三类提醒：来源里找不到的摘录、含外观用词而未被摘录的句子、首见来源里没有出现登记称呼的人物与地点。三类都不是错误：逐条对照原文，确有问题再改，改完不必重跑到清零。交给 vn-director 时在其清单用 visualProfiles 引用，正文合并清单不读取此文件。
- `registry.md`：登记表（`register` 配方），写手共用的作品简报；长篇分段登记时另有 `registry/段号.md`。
- `src/`：`shorthand.mjs units` 导出的逐句编号批次原文，随用随生成。
- `parts/`：每批一份简写稿 `NNN.vns.txt`；每批包含版本、作品、所需实体声明、一个章节及完整内容块，正文行写句子编号或改写全文。
- `drafts/`：初稿的原样副本（用命令复制）；parts 中修订，不覆盖初稿。跨批已知实体可省略重复声明，由合并器补齐。
- `review/`：`shorthand.mjs expand --review` 写出的核对清单，随用随生成。
- `dossiers/`：按章节分组生成的人物资料，以 `@dossier 2` 开头；资料关闭时没有此目录。

续跑时读清单、笔记和已有稿件，重新运行检查，再处理尚未完成的范围。先前输出与检查记录可保留，但以当前草稿重新校验的结果为准。

## 简写稿

```sh
node scripts/shorthand.mjs units "works/novel/convert/project.json" --from p000001 --to p000120 --out "works/novel/convert/src/001.txt"
node scripts/shorthand.mjs expand "works/novel/convert/project.json" "works/novel/convert/parts/001.vns.txt" --review "works/novel/convert/review/001.txt"
```

`units` 把目标范围的每段切成句并编号（`[p000005]` 下的 `5a`、`5b`……；说话提示在冒号处单独成句），附前两段只读衔接和范围外的原注，与普通批次原文同一包装。

`expand` 要求该批已在清单 `parts` 登记来源范围：把简写稿展开为标准分批稿，检查本批用到的段落每一句都照抄、改写或删去过（照抄与删去各一次），照抄行去掉对白外层引号并按 `@alias` 加人物提及，只写段落号或范围（如 `5-12`）的行把这些段落逐句展开为旁白（原文风格用），自动写出 `@source`；再用清单其他批次的实体声明补齐后做与 `--body-only` 相同的来源检查。报告 JSON 的 `ok` 为 true 才算通过。`--review` 写出核对清单：每个改写行删增的文字与原句、删去的句子、行末不是句末标点或疑似说话提示的照抄行；`--out` 另存展开后的标准稿（只用于查看或复核，清单仍登记简写稿）。`assemble-vn` 直接读取 `.vns.txt` 分批稿，无需先展开。

## 合并清单

以下示意假设原文共有六个来源，分成两章：

```json
{
  "schema": "vn-agent-1",
  "book": {"id": "novel", "title": "小说名", "author": "作者（可省略）", "lang": "zh", "blurb": "简介（可省略）"},
  "sourceMap": "source-map.json",
  "parts": [
    {"script": "parts/001.vns.txt", "from": "p000001", "to": "p000003", "chapter": {"id": "ch01", "title": "第一章"}},
    {"script": "parts/002.vns.txt", "from": "p000004", "to": "p000006", "chapter": {"id": "ch02", "title": "第二章"}}
  ],
  "dossiers": [
    {"file": "dossiers/ch01.txt", "from": "p000001", "to": "p000003"},
    {"file": "dossiers/ch02.txt", "from": "p000004", "to": "p000006"}
  ]
}
```

`book.lang` 为作品语言（`zh`／`zh-Hant`／`en`／`ja`），可省略，省略时取 `source-map.json` 的 `lang`；写了就须与它一致，合并时写进 `@book`。

`book.blurb` 为作品简介，合并时写成 `// @vn-blurb` 记录，标题画面显示。`epub.json` 有 `description` 时照录它；原书没有简介时省略。

输入文件路径相对于 `project.json`。同章可连续登记多个批次，使用相同章节 ID／标题；块 ID 全书唯一，例如 `b0001_s01`、`b0002_s01`。批次范围首尾相接，涵盖标题、分隔行及排除材料；这些来源由脚本中的 `// @source-use` 或 `// @vn-transition` 交代，不从清单中跳过。

默认检查整份来源映射。分段推进时在清单顶层加 `"through": "p000003"`，表示本次检查到该来源，parts 也只登记到这里；继续后同步推进 through，全文完成后删除它。若用户只转换某个节选，先将该节选保存为输入并编号。

原书注解按 [格式规范](../../../docs/format.md#原书注解) 使用独立 `// @vn-note` 与行内锚点；每批输入带齐该批引用的原注及续段，包括范围外的页末／章末／篇末来源。编号重复按原页／章语境辨别。独立原注所在来源仍纳入连续批次范围，用 `// @source-use ID kind=annotation reason="原注随对应正文保存"` 登记；内嵌注可以与正文共用来源。合并校验结构与去向，复核核对保留的原注文字、作者／译者归属与链接短语。未能完整识别或可靠关联时允许无注解回退，能确认的独立原注用 annotation 登记并说明省略理由，不强制补齐；不能确认是否原注的段落仍保留为正文。不要给清单新增未支持的 annotations 字段。

清单可选两个字段，用于 Extra（作品包中的书外原文与原书图片，不进入 `.vn.txt`）：

- `"extra": [{"title": "译者序", "from": "p000002", "to": "p000014"}]`：每篇书外文字（序言、导读、后记、创作说明、人物表）一项，照录原书标题，无标题时简短概括；按原文顺序、互不重叠，范围内每个来源都须在正文登记为 `kind=excluded`。版权、目录页、广告、单独书名等只排除，不登记 Extra。
- `"handoff": "handoff.json"`：import-handoff 生成的文件，与 epub 二选一；`--highlights extra` 时其中的高光图进 Extra 图集。
- `"epub": "epub.json"`：number-source 生成的文件。前后两段都保留在正文中的图片成为插图（阅读时从图后第一句起，以 Cut-in 位置显示到该内容块结束），其余进入 Extra 图集，封面居首。

完整验收时加 `--package <story.vn.zip>` 输出作品包（不能与 `--body-only` 同用），报告的 `package` 列出 Extra 篇数、插图、图集与封面。

资料尚未写好时用空数组 `"dossiers": []`。每份资料的 from／to 是允许新增披露事件的完整目标范围（通常是一个章节分组），各文件只写本组增量。

清单顶层可加 `"dossier":{"mode":"detailed","batching":"group"}`。mode 为 off／simple／detailed，省略为 detailed；batching 只记录执行选择（group 为章节分组，也可写 chapter／book），实际范围以每份资料的 from／to 为准。off 只保留人物染色：不登记资料文件，也不要求简介。simple 只维护姓名和简介，工具拒绝分组、详情、删除或外观事件。分组示例：把上面两份资料合为一份 `{"file":"dossiers/g01.txt","from":"p000001","to":"p000006"}`，正文 parts 仍按章独立。

正文、资料、导演和生图允许由不同模型或方式完成。交接至少携带本清单、source-map、已验收分批稿、资料文件及 visual-profiles.json，在 notes 记录各阶段的完成范围、待处理原因与下一步；交接方先用工具重验，不按文件存在就宣称完成。正文完成但资料未完时用 --body-only 导出 body 与 context 供资料阶段继续。导演另用自己的 project.json 引用已交付 .vn.txt；生图以可执行队列及带原因的完整图片任务清单为准。

## 正文检查与资料上下文

```sh
node scripts/assemble-vn.mjs "works/novel/convert/project.json" --body-only --lengths
```

`--body-only` 暂不要求人物简介齐全；清单里已有的资料仍会校验和嵌入。正文还在推进、资料尚未补齐时用它检查前缀。

`--lengths` 在报告中加 `lengths`：`parts` 是每批正文与原文的字数比（只数文字和数字）；`outside` 列出共用来源的单元组中，字数比低于 0.6 或高于 1.5 的位置（来源、原文字数、正文字数、比值）。这是对照原文检查的线索：逐条读原文确认是漏文、增写还是合理的删改，不必为此另写比对脚本。

资料阶段的上下文：

```sh
node scripts/assemble-vn.mjs "works/novel/convert/project.json" --body-only --context "works/novel/convert/context-g02.txt" --context-range p000958-p001371
```

`--context-range` 取资料分组的 from-to，只保留完全落在范围内的正文块；省略时输出全部已合并正文。`context.txt` 依次包含：

- 实体登记：固定实体声明、曾公开称呼和当前公开状态。
- 已有资料：每行一个人物的资料状态。
- 待补简介（missingSummaries）：截至当前范围仍缺简介的人物及其首次公开块。
- 正文块：每块一行 `@block`，其后每行一个单元（来源、说话人 ID、文字，制表符分隔）；首次公开的人物在其单元下写 `firstReveals`；块末 `publicNames` 为读完该块时的公开名，之后的块只用 `publicNames+` 写变化。
- 范围外首次公开参考：待补简介人物在本组之前的首次公开块，只用来核实事实。

写资料时读取该文件。正文块中的来源、说话人与 firstReveals 是依据，实体登记的最新名字不代表早期读者已知。资料阶段不发送原文或全书 visual-profiles。使用以下规则组合，二选一加载模式片段：

```sh
node scripts/prompts.mjs --recipe dossier --out "works/novel/convert/dossier-rules.md"
node scripts/prompts.mjs --fragment dossier10.detailed --out "works/novel/convert/dossier-mode.md"
```

简单模式把第二条的片段改成 `dossier10.simple`；`dossier` 配方本身不含模式规则。开启世界词条时清单写 `"dossier":{"mode":"simple","glossary":true}`（或 detailed），并另导出 `--fragment dossier10.terms` 一起使用：`@term` 每个词条全书只登记一次，写在其首次出现所在或之后的资料分组里；阅读时由程序按名称自动匹配正文，正文不加标记。生成者须读取两份导出内容及实际材料。用 `@intro`（首次公开即解锁）或 `@after 块ID`（读完该块解锁）设置披露位置，资料不写来源证据：每条内容放在其最后一处依据所在块之后。fullName 与正文 label 独立，详细模式不生产 @portrait。资料文件更新清单后，运行完整验收。

## 按需复核与局部补丁

```sh
node scripts/prompts.mjs --recipe review --out "works/novel/convert/review-rules.md"
node scripts/shorthand.mjs expand "works/novel/convert/project.json" "works/novel/convert/parts/001.vns.txt" --out "works/novel/convert/review/001.vn.txt"
```

复核读展开后的标准稿，确认的修改改在简写稿上，不另存标准稿。以下补丁工具用于标准 `.vn.txt` 分批稿（如其他工具交来的稿件）：`node scripts/apply-patches.mjs <part.vn.txt> <patches.json> --out <新文件>`。

复核提供目标编号原文、当前工作稿、现有实体与必要衔接，按导出的协议填写 baseSha256、行范围及 before。只修有明确依据的基本语法或语义错误，不加载风格规则，不润色或按节奏、字数重分屏。无确定错误保留原稿；疑点另记。应用后将清单指向新工作稿并重新合并校验，保留原稿；不需要补丁时也可由当前 agent 局部编辑工作稿。

## 完整验收与输出

```sh
node scripts/assemble-vn.mjs "works/novel/convert/project.json" --out "works/novel/convert/story.vn.txt"
npm run validate -- "works/novel/convert/story.vn.txt" --strict
```

省略 `--out` 和 `--context` 时只检查。输出路径相对于命令工作目录；可重复生成同一派生输出，输入草稿保持不变。

合并工具复用仓库的来源映射、批次检查、名称继承、合并和 dossier 校验，检查来源覆盖、实体声明一致性、章节连续性、块 ID、资料披露位置与简介完整性。成功打印 JSON 报告，失败返回非零退出码并说明位置；检查失败时不写输出。`warnings` 和 `duplicates` 用于定位需对照原文审阅的内容，`sourceComplete` 仅表示清单是否覆盖整份原文。

本清单是 agent 的本地制作记录；成品仍为标准 `.vn.txt`。首章试读稿可独立导入，但不包含作品包的 complete 标记；之后的完整稿导入书架时替换旧稿。
