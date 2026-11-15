# V12 · director/design.md

正式开发模块。仅标记内的文字属于提示词。全书设计在登记后发送一次，结果作为各章导演的既有设计。

## design.task

<!-- prompt:design.task -->
# 全书视觉设计

各章导演开始之前，依据原文对全书人物与地点的外观描写，一次确定作品画风、主要人物的固定外貌与衣着，以及常用地点的主图描述。各章导演会逐字沿用这些设计，次要人物与只出现一次的地点留给各章导演。只返回指定结构的 JSON。
<!-- /prompt -->

## design.request

<!-- prompt:design.request -->
书籍：⟪bookTitle⟫，共 ⟪chapterCount⟫ 章
已固定画风：⟪styles⟫
本次需要：⟪needs⟫
全书人物与地点（names 为后文揭示的名字，chapters 为大致出现的章数，look 为原文描写其外观的原句，note 为用户或参考图说明给出的外观）：
⟪entities⟫

主要人物指在多章出现或对情节重要的人物；常用地点指在多章出现或作为主要舞台的地点。look 是原文描写该对象外观的原句。原句写明的内容照原句写进设计：人物的年龄、发色、瞳色、肤色、体型、标志性特征与衣着，地点的空间、建筑、材质与陈设。带 when 的原句写的是那一时期或场合的样子，默认形象按不带 when 的原句写；几处原句说法不同时，按主要故事时段里较具体的一处。note 是用户或参考图说明给出的外观，同样照写，与原句不同时按 note。原句与 note 都没写到的部分，以及两者都没有的对象，按年代、文化与人物语境合理补全。
<!-- /prompt -->

## design.output

<!-- prompt:design.output -->

## 本次输出
顶层结构：{⟪artStyles⟫"characters":[{"characterId":"人物ID","face":"English head and face description","body":"English build, clothing and stance"}],"backgrounds":[{"locations":["地点ID"],"prompt":"English master description of the place"}]}
没有额外身体细节时 body 写 ""。不需要人物图时 characters 为 []，不需要地点背景时 backgrounds 为 []。ID 使用输入原值，每个对象只出现一次；多个环境兼容的地点可共用一条主图。
<!-- /prompt -->

## design.ambients

<!-- prompt:design.ambients -->
## 氛围背景
氛围背景显示在没有地点图的内容后面。全书反复出现的气氛（如同一座城市的雨夜、贯穿多章的回忆基调）可在此登记，各章导演以 ID 复用；只在一章出现的留给各章导演。每项 {"id":"简短英文ID","name":"简短中文名","prompt":"英文画面描述"}：选择环境片段、局部物件、轮廓、半具象空间、意象或抽象色彩材质，写明主体、层次、构图和光照；后文才揭示的事件与身份不出现在画面与 name 中。
<!-- /prompt -->

## design.output-ambients

<!-- prompt:design.output-ambients -->
顶层另加 "ambients":[{"id":"rain-city","name":"雨夜街道","prompt":"English atmosphere description"}]，没有需要全书复用的氛围背景时为 []。
<!-- /prompt -->

## design.title-card

<!-- prompt:design.title-card -->
## 作品封面
本次提供 titleCard:{"prompt":"英文画面描述"}：作品开场标题画面与书架封面共用的一张插图，画幅为“本次需要”中 titleCard 的值（如 16:9 landscape、2:3 portrait）。按一张经过设计的书籍封面来写，而不是一个场景的截图：
- 核心意象：选一个最能代表全书的主体——一件物品、一处标志性的场所、一个人物的剪影或姿态，或由它们组成的象征性画面。主体只有一个，最多再加一两个与之呼应的次要元素。
- 构图：写清主体的位置、大小、视点与景别，以及留白在哪里。画面下方约三分之一保持简洁、明暗平稳，书名会排在那里。
- 色彩：写出两三种主色与明暗关系，整体统一；可以用强烈的明暗对比、剪影、大面积的单一色调。
- 表现：在全书画风之内，可以用更有设计感的处理，如对称、几何分割、框景、重复的纹样或有象征意义的装饰，装饰服务于主体。
- 细节：只写主体与必要的环境，不逐项列出人群、杂物或繁复的背景。
画面中不出现文字、书名或类似字母的形状；后文才揭示的身份、事件与结局不出现在画面中。
<!-- /prompt -->

## design.output-title-card

<!-- prompt:design.output-title-card -->
顶层另加 "titleCard":{"prompt":"English cover illustration description"}。
<!-- /prompt -->

## design.variants

<!-- prompt:design.variants -->
## 差分
可预见、反复出现的差分在此登记：年龄阶段、长期换装、受伤、伪装与真实形象、灾后的地点等；人物差分的 density 为 rich 时，也登记主要人物在全书多次用到或有助于塑造人物的表情（不限于夸张的表情），以及其他人物性情大变、反派露出真面目等转折处的表情。表情差分只写 face：原样沿用默认设计的面部身份特征，再用一个简短的英文短语点明这一表情（如 weeping、a cold sneer、a rare soft smile），最多补一处最显著的外在迹象；不逐项描写肤色、眼部、泪痕、口型与头发的变化。各章导演引用这些 ID 安排使用范围。每项 {"id":"实体ID.简短英文","entityId":"人物或地点ID","name":"简短中文名","reason":"使用理由", ...}：人物写 face 和／或 body 的完整替换值，未写的字段沿用该人物的设计，body 只写大腿中部以上；默认设计里有、这一状态下不在的衣物、配饰或携带物（如背着的剑、帽子），在 body 末尾写明不带（如 no sword on his back）：差分图由默认图编辑而来，没写明的会保留；地点写完整 prompt，保留主图的空间布局。name 用两到六个字概括最显著的变化，不写后文才揭示的身份。
在 characters 中为主要人物加 "main":true：主角、视角人物和贯穿全书的少数人物。主要人物每人最多 4 个差分；其他人物最多 1 个，只在外观变化影响理解剧情（伪装、身份揭示、明显的年龄跨度）或 rich 时有上述转折表情时登记；每个地点最多 2 个。伪装、易容等身份诡计中，人物设计写读者最先看到的样子，真实形象登记为差分。只登记可预见、反复出现的差分，给各章留出余量。
<!-- /prompt -->

## design.output-variants

<!-- prompt:design.output-variants -->
顶层另加 "variants":[{"id":"lin.injured","entityId":"lin","name":"受伤","reason":"…","body":"English full replacement"}]，没有可预见的差分时为 []；主要人物条目另加 "main":true。
<!-- /prompt -->

