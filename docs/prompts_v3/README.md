# 项目提示词：唯一维护入口

规则、示例和图片模板统一在本目录编辑。skill 通过 `scripts/prompts.mjs --recipe／--fragment` 导出规则，导演 CLI 的 packet 与生图任务直接从生成库组装；播放器不编辑提示词。用户可在自己的 agent 环境中覆盖或补充规则，但产物仍须通过同一套校验。

## 现行规则

| 阶段 | 模块 | 输出 |
| --- | --- | --- |
| 登记 | [任务](register/task.md)、[章节与书外材料](register/chapters.md)、[人物、地点与续登](register/entities.md)、[公开节点、特殊段落、原注与错字](register/passages.md)、[外观参考](register/visual.md)、[登记表格式](register/output.md) | registry.md 与 visual-profiles.json |
| 正文 | [任务与完整示例](body/task-format.md)、[块](body/blocks-reading.md)、[实体与公开](body/characters-reveal.md)、[对白与分屏](body/dialogue-expressions.md)、[来源与注解](body/sources-notes-transitions.md)、[文字风格](body/style.md)、[连续状态](body/continuity-inheritance.md)、[简写稿](body/shorthand.md) | @vn 0.10 文本；简写稿 .vns.txt 由工具展开 |
| 人物资料 | [任务](dossier/task-style.md)、[简单模式](dossier/simple.md)、[详细模式与示例](dossier/detailed.md)、[披露位置](dossier/disclosure.md)、[语法](dossier/output.md)、[世界词条](dossier/terms.md) | @dossier 2 文本 |
| Director | [独立 v13 规则、输入与完整字段示例](director/composition.md) | version 13 JSON |
| 可选复核 | [基本语法与明确语义](review/checks.md)、[补丁协议](review/patch-output.md)、[请求](review/request.md) | 精确补丁 JSON |
| 共用材料与修复 | [输入材料](common/input-materials.md)、[修复包装](common/repair.md) | 附入对应阶段 |
| 图片任务 | [用途模板](image/tasks.md) | 生图英文提示词 |

默认正文采用 format-shorthand（format＋简写稿写法）＋style、style-no-tags 或 style-original（原文照录）；人物资料采用 dossier 核心及所选简单／详细模式；Director 按用途追加独立 director11.chapter／locations／cg／cut-in／characters，最后给本次顶层结构、完整条目示例和预算。候选人物输入 id 对应输出 characterId，地点 id 对应 locations 数组。立绘由 face 与 body 拼成，头像从立绘裁出；画风分别用于环境和人物／CG。

正文每句一行、逐句一屏。注解关联不完整允许无注解内容回退，保留正文与来源。复核只修基本语法和有依据的语义错误，保留正确表达。

本目录以外的候选稿与历史文档不参与现行请求。

## 编译与验证

标记内的文本发送给模型，模块标题与开发说明不发送。占位符由程序替换一次，原文不会执行。manifest.json 管理片段、字段和组装顺序。

修改 Markdown 后运行：

```powershell
npm run prompts:build
npm run prompts:check
```

生成库为 src/prompts/library.generated.js，不手工编辑。npm start 启动前编译。最终核对实际请求文本，不能只看单个片段。

## 导出与检查

离线检查或导出规则：

```powershell
node scripts/prompts.mjs --recipe format --out prompt-review/format.md
node scripts/prompts.mjs --recipe dossier --out prompt-review/dossier.md
node scripts/direct-vn.mjs project.json --packet ch01 --out director-request.txt
```

静态 recipe 只导出规则；导演 packet 带本章材料。组装、字段与来源由程序检查；模型生成质量须另行对照实测。
