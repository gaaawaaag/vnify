# B1 · body/task-format

开发编辑模块。标记之间是发送给模型的文字；标记和本文标题不发送。⟪字段⟫ 由程序填入，不执行代码。来源和字段见 manifest.json。

## body.task

<!-- prompt:body.task -->
# 视觉小说正文转换-语法与格式

请将给定的目标小说原文，转换为符合 `@vn 0.10` 标准的视觉小说脚本。

## 一、交付与输出规范

1. **交付**：输出本批纯文本脚本。给定人物与地点表中的对象直接引用 ID，声明区只写本批新增对象。
2. **首行强制**：第一行必须且只能是 `@vn 0.10`。
3. **范围约束**：严格转换目标编号范围，处理至最后一个目标来源。只读衔接上下文仅供理解，不得作为正文来源登记；另附的原书注解材料可作为注解 source，不计为本批叙事。
4. 原文与旧稿作为转换素材。

## 二、语法与结构规范（Parser 规则）

脚本按顺序由以下部分构成：`版本声明` → `@book` → `新增实体声明（如有）` → `@chapter` → `内容块与正文`。所有指令独占一行，参数使用 `key=value`，含空白的值使用英文双引号。

ID 以英文字母开头，其余仅含英文字母、数字、`_`、`-`，`none` 为保留值，不用作实体或结构 ID；`guest` 为非实体说话人标记，不用作实体 ID。字符串属性内的双引号写作 `\"`，反斜杠写作 `\\`，不跨行。语法示意中的方括号表示可选参数、斜杠表示择一，不将它们照抄为参数值；正文人物标签的方括号则必须保留。


<!-- /prompt -->

## body.example

<!-- prompt:body.example -->
### 3. 结构示例

此例的人物和地点均为新增对象，因此包含声明。正文逐句分屏；最后两个 document 分别是信件（message）和诗句（verse）。

```text
@vn 0.10
@book demo title="示范作品"
@character lin label="林舟" color="#79b9ae"
@location old_station label="旧车站"
@chapter ch01 title="第一章 启程"
@scene b001_s01 loc=old_station
@source p000001
林外的微风掠过站台。
@source p000002
{{lin|林舟}}停下了脚步。
@source p000003
[lin] 这里就是人们常说的那个「旧站」了。
@scene b001_s02 loc=old_station time="清晨"
@source p000004
翌日清晨，站台上又吹起微风。
@narration b001_n01
@source p000005
记忆有时像一扇门。
门后藏着一个已经忘记的清晨。
@source p000006
可是记忆并不因此消失。
@document b001_d01
@source p000007,p000008
@text
林舟：

车站明早开放。
请带上旧车票。

站务室
@enddocument
@document b001_d02 style=verse
@source p000009
@text
风从站台吹过，
    吹向没有名字的清晨。
@enddocument
```


<!-- /prompt -->
