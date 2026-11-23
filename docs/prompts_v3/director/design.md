# V12 · director/design.md

正式开发模块。仅标记内的文字属于提示词。全书设计在登记后发送一次，结果作为各章导演的既有设计。

## design.task

<!-- prompt:design.task -->
# 全书视觉设计

各章导演开始之前，依据原文对全书人物与地点的外观描写，一次确定作品画风、主要人物的固定外貌与衣着、常用地点的主图描述，以及全书反复出现的氛围背景。各章导演会逐字沿用这些设计，次要人物与只出现一次的地点留给各章导演。只返回指定结构的 JSON。
<!-- /prompt -->

## design.request

<!-- prompt:design.request -->
书籍：⟪bookTitle⟫，共 ⟪chapterCount⟫ 章
已固定画风：⟪styles⟫
本次需要：⟪needs⟫
全书人物与地点（names 为后文揭示的名字，chapters 为大致出现的章数，look 为原文描写其外观的原句，note 为用户或参考图说明给出的外观）：
⟪entities⟫

主要人物指在多章出现或对情节重要的人物；常用地点指在多章出现或作为主要舞台的地点。地点主图按区域规划：同一建筑或区域内不重要的子地点归入较笼统的区域主图（同一条 locations），剧情关键或反复出现的房间单独出图；地点的首张主图全书沿用。有全书图片总数上限时，先分配给主要地点、主要人物与反复出现的氛围，给各章的 CG 与其余图片留出余量。look 是原文描写该对象外观的原句。原句写明的内容照原句写进设计：人物的年龄、发色、瞳色、肤色、体型、标志性特征与衣着，地点的空间、建筑、材质与陈设。带 when 的原句写的是那一时期或场合的样子，默认形象按不带 when 的原句写；几处原句说法不同时，按主要故事时段里较具体的一处。note 是用户或参考图说明给出的外观，同样照写，与原句不同时按 note。原句与 note 都没写到的部分，以及两者都没有的对象，按年代、文化与人物语境合理补全。遇到生僻、特定年代或特定文化区域的器物、服饰、建筑构件与专有名词（不限国家与文化）时，不要只写简称或音译词，须展开写出其具体外形、结构与材质，让生图模型仅凭字面即可画准。
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
氛围背景显示在没有地点图的内容后面（无地点的场景、narration、不制作地点图的地点），表现一段内容的气氛基调。全书反复出现的气氛（如同一座城市的雨夜、贯穿多章的回忆基调）可在此登记，各章导演以 ID 复用；只在一章出现的留给各章导演。每项 {"id":"简短英文ID","name":"简短中文名","prompt":"英文画面描述"}：选择环境片段、局部物件、轮廓、半具象空间、意象或抽象色彩材质，写明主体、层次、构图和光照；后文才揭示的事件与身份不出现在画面与 name 中。
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
- 构图：写清主体的位置、大小、视点与景别。
- 色彩：写出两三种主色与明暗关系，整体统一；可以用强烈的明暗对比、剪影、大面积的单一色调。
- 表现：在全书画风之内，可以用更有设计感的处理，如对称、几何分割、框景、重复的纹样或有象征意义的装饰，装饰服务于主体。
- 细节：只写主体与必要的环境，不逐项列出人群、杂物或繁复的背景。
画面中不出现文字、书名或类似字母的形状；后文才揭示的身份、事件与结局不出现在画面中。
<!-- /prompt -->

## design.output-title-card

<!-- prompt:design.output-title-card -->
顶层另加 "titleCard":{"prompt":"English cover illustration description"}。
<!-- /prompt -->

## design.end-card

<!-- prompt:design.end-card -->
## 结尾图
本次提供 endCard:{"prompt":"英文画面描述"}：读完全书后结尾画面的背景插图，画幅同 titleCard（“本次需要”中 endCard 的值）。它是全书的余韵：与封面呼应，可以是封面的主体或场所在故事结束时的样子，也可以是一处意味深长的远景或空镜。写出结局之后的情绪与氛围，可以表现结局后的状态，不画具体的情节场面。
- 构图：写清主体的位置、大小、视点与景别。
- 色彩：写出两三种主色与明暗关系，可以与封面的配色形成对照（如由暗转明、由冷转暖）。
画面中不出现文字或类似字母的形状。
<!-- /prompt -->

## design.output-end-card

<!-- prompt:design.output-end-card -->
顶层另加 "endCard":{"prompt":"English closing illustration description"}。
<!-- /prompt -->

## design.blurb

<!-- prompt:design.blurb -->
## 作品简介
本次提供 blurb：标题画面在书名与作者下方显示的作品简介，写给还没读过这本书的读者。用两到四句、约 60 到 150 字交代故事的前提：主人公是谁，身处什么地方与处境，遇到了什么事或要去做什么；最后一句落在悬念、张力或气氛上，让人想读下去。依据正文开头部分的设定与情节来写，只写读者在开头就能知道的事。语气贴合作品的文风。
后文才揭示的身份、转折、真相与结局不写进简介；不写评价与宣传语（如“感人至深”“不容错过”），不写作者与出版信息。
<!-- /prompt -->

## design.output-blurb

<!-- prompt:design.output-blurb -->
顶层另加 "blurb":"作品简介"。
<!-- /prompt -->

## design.voices

<!-- prompt:design.voices -->
## 声音画像
本次提供 voices：为朗读写声音画像，按画像设计或挑选音色。为旁白（narrator）、没有名字的说话人（other）和每个有台词的人物（人物 ID）各写一句中文描述：性别、年龄感、音色（高低、明暗、粗细）、语速与说话的语气。依据正文里的身份、年龄与说话方式来写；原文写到的嗓音特点（沙哑、口吃、方言腔）照写。旁白按作品的叙述口吻来写：第一人称旁白就是叙述者本人的声音。只写声音，不写外貌与剧情，不写后文才揭示的身份。每条 20 到 60 字。
<!-- /prompt -->

## design.output-voices

<!-- prompt:design.output-voices -->
顶层另加 "voices":{"narrator":"声音画像","other":"声音画像","人物ID":"声音画像"}。
<!-- /prompt -->

## design.music

<!-- prompt:design.music -->
## 曲目表
本次提供 music：全书的背景音乐曲目表，按章安排的音乐切换点只从这里选曲。曲目数取“本次需要”里 music 给的范围，按作品的基调与题材覆盖全书反复出现的气氛（如主题、日常、紧张、悲伤、温情、回忆、高潮）；短篇或气氛单一的作品可以取下限或更少。每首 {"id":"简短英文ID","name":"两到六字的中文名","prompt":"英文描述"}：prompt 写给音乐生成模型，一到三句写明风格与时代感、主奏乐器、情绪、速度（BPM 或 slow／moderate／fast），注明 instrumental, no vocals 与 loopable background music；各首之间风格统一，能听出是同一部作品。只写音乐本身，不写剧情与人物名。
<!-- /prompt -->

## design.output-music

<!-- prompt:design.output-music -->
顶层另加 "music":[{"id":"main-theme","name":"主题","prompt":"English music description"}]。
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

