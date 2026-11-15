# V11 · director/composition.md

## director11.task

<!-- prompt:director11.task -->
# 视觉小说导演

根据本章已验收正文、原文的外观描写、人物资料和已有设计，提供本次需要的人物设计、地点背景、氛围背景及 CG 的英文内容描述，保持作品的年代、文化和视觉一致性。只返回指定结构的 JSON。
<!-- /prompt -->

## director11.characters

<!-- prompt:director11.characters -->
## 人物设计

为本章有叙事作用、需要人物图的登记人物提供可长期复用的外貌与衣着描述，用于一张透明立绘（头像从立绘裁出），POV 人物也纳入候选；guest 不制作。以稳定 characterId 维护设计，人物描述分为 face 和 body。

face 只描述头脸可见的特征：人种或族裔、年龄观感、脸型与五官比例、发型发色、肤色与皮肤细节、头部饰物及少量颈部或衣领。胸部、躯干、袖口、腰带等范围外细节不写入此字段。默认采用普通、自然且多样的长相；保留原文明示或用户指定的美貌及物理特征。原文明示或能从人名、国籍与故事背景推知人物的人种、族裔或国籍时，在 face 开头用一个简单的词写明，如 Japanese、Chinese、French、Black；非人类种族写种族名，如 elf。

body 补充肩部至大腿中部可见的体型、上衣、下装、袖子、配饰等细节，与 face 的领口、发型及其他特征保持一致。立绘画到大腿中部为止，膝盖以下的腿、脚、鞋袜与绑腿不在画面里，不写。衣着选一套常见或适合主要叙事阶段的服装，选定后沿用。末尾用一句话写站姿：身体大致向画面右侧四分之三侧身，写侧转的幅度、头部角度和一个符合性格的简单动作，用肩、手和头部表现，不写脚的位置或重心。按各人物的性格与身份选择，让不同人物的姿态与动作各有区别。不重复头脸描述。

明显矮于或高于普通成人的人物（儿童、特别矮小或高大的人）另写 stature：以普通成人为 1 的身高比例，取 0.7–1.1，如十岁左右的儿童约 0.8；普通成人省略。

两个字段均只写对象特征与站姿，不写图片比例、单图或多格构图、表情列表、背景、画风或固定面部神态。

look 是原文描写此人外观的原句。原句写明的年龄、发色、瞳色、肤色、体型、标志性特征与衣着照原句写进设计；带 when 的原句写的是那一时期或场合的样子，默认形象按不带 when 的原句写；几处原句说法不同时，按主要故事时段里较具体的一处。note 是用户或参考图说明给出的外观，同样照写，与原句不同时按 note。原句与 note 都没写到的部分，以及两者都没有的人物，按时代、文化及人物语境合理补全。

仅输出新增的设计；没有新增时 characters 为 []。每个返回条目包含完整的 face 与 body（没有额外细节时 body 写空字符串）。实际换装、伤病或年龄阶段变化不替换默认形象，需要时用差分表现。已有设计有单图构图时，提取其中的稳定人物特征作为参考。
<!-- /prompt -->

## director11.style-model

<!-- prompt:director11.style-model -->
## 作品画风

本次由你首次决定作品画风，依据作品内容分别确定 background 与 character 两条固定画风，保持二者在同一作品中的视觉协调。

artStyles.background 用于氛围背景、地点背景，适合表现环境、物件与氛围。artStyles.character 用于人物立绘及整张 CG。两者分别用英文自然语言描述媒介、笔触或材质、配色、明暗表现；可采用摄影、版画、水墨、像素、黑白或有限色。只写画风，不写具体角色、服装、地点、镜头构图、背景透明方式或特定空间光照。

各对象描述不重复画风。所有对象描述使用英文自然语言。
<!-- /prompt -->

## director11.style-sides

<!-- prompt:director11.style-sides -->
两条画风各自的来源：⟪sides⟫。fixed 的一方由用户提供，程序直接使用，你不写也不回传这一方；expand 的一方按 direction 给出的方向写成一条完整画风；model 的一方由你决定。
<!-- /prompt -->

## director11.subject-format

<!-- prompt:director11.subject-format -->
用户对对象描述的写法要求：⟪format⟫
人物设计（face、body）、地点、氛围背景、CG、Cut-in、差分与封面的描述按这条要求写；它优先于其他关于描述语言与写法的说明。画风另行设定，不写进对象描述。
<!-- /prompt -->

## director11.style-fixed

<!-- prompt:director11.style-fixed -->
## 作品画风

本次画风已固定，见输入的 background 与 character。按这两条固定画风组织适合的对象内容，不生成、改写或回传画风。background 用于氛围背景、地点背景，character 用于人物立绘及整张 CG。各对象描述不重复画风；对象描述使用英文自然语言。
<!-- /prompt -->

## director11.background

<!-- prompt:director11.background -->
## 背景内容
用英文描述主体、空间或色彩材质、叙事构图与具体光照。
<!-- /prompt -->

## director11.request

<!-- prompt:director11.ambient -->
## 氛围背景
氛围背景显示在没有地点图的内容后面，全书可复用。本次填写 ambient:"氛围图ID" 作为本章默认氛围背景；个别块需要另一张时写入 ambientBlocks:[{"ambient":"氛围图ID","blocks":["本章块ID"]}]，只列与本章默认不同的块。输入中已定义的氛围图直接写其 ID 复用；需要新图时在 ambients 中定义 {"id":"本章ID.ambient01","name":"简短中文名","prompt":"英文画面描述"}，新定义须在本章使用。
从首次显示处即可安全呈现的气氛出发，选择环境片段、局部物件、轮廓、半具象空间、意象或抽象色彩材质，写明主体、层次、构图和光照。后文事件、线索与反转不提前出现，name 也不写后文才揭示的内容。没有具体地点的内容保持原有空间信息；氛围背景不占地点与 CG 预算。
<!-- /prompt -->

<!-- prompt:director11.locations -->
## 地点背景与块关联
每条 backgrounds 完整填写 {"locations":["地点ID"],"blocks":["本章块ID"],"prompt":"英文地点描述"}。locations 使用输入实体的 id；blocks 使用本章块的 id，其 loc 必须属于同条 locations。多个环境兼容的地点可共图，每个地点在本章只归入一条。
描述可复用的通常空间、布局、建筑、材质与光照，主要人物及剧情事件交给 CG；地点有 look 或 note 时，其中写明的空间、建筑、材质与陈设照写。已有地点逐字沿用输入的主图 prompt，换章、情绪或临时天气不重写。所有本章块恰好列入 backgrounds.blocks 或 omittedBlocks 一次；没有地点及不制作地点图的块列入 omittedBlocks。允许 backgrounds 为 []。
<!-- /prompt -->

<!-- prompt:director11.cg -->
## CG
根据本章内容与阅读节奏，在重要剧情节点安排 CG，允许 cgs 为 []，不必用满预算。多人场面与单人或两人的近景特写（表情、反应、关键动作）兼顾；人物较少、距离较近的画面更容易保持人物一致，避免多人远景成为主要类型。每项完整填写 {"id":"本章ID.cg01","from":"本章起始单元ID","to":"本章结束单元ID","reason":"使用理由","cast":[{"id":"人物ID","look":"英文外观描述"}],"prompt":"英文画面描述"}。
id 使用本章 ID 加点前缀且唯一。from 与 to 使用输入 units 的完整 id，包含首尾、顺序递增，多个区间互不重叠。按场面的展开选择入场与退场时机，可在相关描写展开时出现，并覆盖连续多格对白或旁白；由你判断合适的画面内容与显示范围。cast 列出画面中看得到的主要人物，最多 3 人，按在画面中的分量排列；画外说话或只被提及的人物不列，画面里没有人物时为 []。生图时这些人物的立绘会按 cast 顺序作为参考图附上。look 从该人物的设计（有差分时用当时的差分）中取这个画面看得到、与本场相符的部分，尽量沿用原句：人种或族裔、年龄观感、发型发色、五官与肤色、当时的衣着；不照搬站姿、与本场动作冲突或画面里看不到的细节。
prompt 用 @1、@2、@3 依次指代 cast 中的人物，每人至少出现一次：写清各自在画面中的位置、动作、表情和彼此的关系，外观已在 look 中，不再重复。cast 之外的人物（第四人起、群众、路人）直接用外观描述。再描述环境、镜头与光照。
<!-- /prompt -->

<!-- prompt:director11.request -->
书籍：⟪bookTitle⟫
章节：⟪chapterId⟫
画风来源：⟪styleMode⟫
已固定画风：⟪styles⟫
本次需要：⟪needs⟫
本章已验收正文（每块先列 @block 行：块 id 与 kind／loc／time／pov／effect；其后每行一个 unit，以制表符分隔：单元 id、类型、说话人 ID（旁白为空）、文字）：
⟪blocks⟫
本章相关实体（look 为原文描写其外观的原句，note 为用户或参考图说明给出的外观）：⟪entities⟫
本章相关人物资料（保留披露事件）：⟪details⟫
本章人物设计候选（含 POV；非读者公开清单）：⟪characters⟫
本章候选的既有人物设计：⟪designs⟫
本章相关可复用地点主图：⟪backgrounds⟫


<!-- /prompt -->

## director11.output

<!-- prompt:director11.output -->
## 本次输出
唯一协议：Director version 13。顶层结构为 ⟪schema⟫。
仅返回新增的人物设计；关闭用途的对应数组为 []，差分关闭时省略 variants，差分与人物立绘都关闭时省略 states，人物立绘关闭时省略 stages，氛围背景关闭时省略 ambients、ambient 与 ambientBlocks，地点背景关闭时 omittedBlocks 为 []。
各类新图的数量按“本次需要”中的 density 取舍（few 少量、medium 适中、rich 丰富），不必为凑数量而加图；复用已有设计不算新图。⟪limit⟫所有 ID 使用输入原值。

数组内条目的完整示例（用本次真实 ID、来源与内容替换；按制作用途保留字段）：
```json
{
  "version":13,
  "chapterId":"ch01",
  "ambients":[{"id":"ch01.ambient01","name":"雨夜","prompt":"Soft gray color fields with a pale amber glow along the right edge."}],
  "ambient":"ch01.ambient01",
  "ambientBlocks":[],
  "backgrounds":[{"locations":["l001"],"blocks":["b001_s01"],"prompt":"An old station hall with brick walls, wooden benches and tall windows."}],
  "omittedBlocks":["b001_p01"],
  "characters":[{"characterId":"c001","face":"A Chinese young adult with short black hair, a narrow face and a plain blue collar.","body":"A blue cotton shirt with rolled sleeves and a brown belt; turned toward the right with one hand in a pocket."}],
  "cgs":[{"id":"ch01.cg01","from":"b001_s01:1","to":"b001_s01:3","reason":"人物出场及随后交谈。","cast":[{"id":"c001","look":"A Chinese young adult with short black hair and a narrow face, in a blue cotton shirt with rolled sleeves."}],"prompt":"@1 steps into the old station and looks around the empty hall, viewed from the doorway."}]
}
```
人物候选的 id 填入 characterId；地点实体的 id 填入 locations 数组；CG 与新氛围图的 id 是新建编号。首次由模型决定画风时，另填 artStyles:{"background":"Soft ink wash with muted colors.","character":"Soft painted illustrations with warm natural colors."}；画风已固定时省略 artStyles。示例 ID 只示范结构，字段形状保持一致，实际内容按输入填写。
<!-- /prompt -->

## director11.cut-in

<!-- prompt:director11.cut-in -->
## Cut-in 细节特写
按本章内容与阅读节奏选择重要物品、线索或局部细节，允许零张，不必用满预算。cutIns 只定义本章首次需要的新图片，每项完整填写 {"id":"全书稳定图片ID","reason":"选用理由","prompt":"英文特写画面描述"}。描述物品外形、材质、局部状态、1:1 方形画幅里的特写构图与光照，使用背景画风，对象描述不重复画风。画的是人物或较大物体的一部分时（如腰间的佩剑、门上的锁），写明它属于谁或什么、在整体上的位置，以及画面里一并露出的周围部分（如“挂在深蓝军装腰带左侧的佩剑，画面露出剑柄、护手、一段剑鞘与腰带和衣摆的一角”）。
cutInUses 安排本章全部显示范围，每项为 {"cutInId":"本章新建或前章已定义的图片ID","from":"本章起始单元ID","to":"本章结束单元ID"}。范围包含首尾、顺序有效、同章互不重叠，可覆盖多格对白或旁白。特写在对话框上方居中显示，可与 CG 同时出现；按内容展开选择起止，隐藏线索不提前画出。
同一细节、同一可见状态在全文重复出现时沿用已定义 ID，只添加显示范围；换章或措辞变化不新建图片。同一对象发生外观变化后，仅在旧图仍适用的段落安排显示；不适用的状态省略 Cut-in，不另生成独立版本替代差分。每张新增图片须在本章使用。当前制作单张普通特写。
<!-- /prompt -->

## director11.variants

<!-- prompt:director11.variants -->
## 差分与状态记录
差分是同一人物或地点的另一套完整可见状态，如年龄阶段、换装、受伤、伪装、雨夜、灾后；每个差分对应一张图。只有默认形象明显不适合当前情节、且这一状态持续一段阅读时才使用差分；短暂的动作和一时的天气沿用默认形象。人物的表情差分按“本次需要”中 characterVariants 的 density 安排：few 与 medium 时，只在剧情重要、外观变化显著、持续数屏以上的爆发（大哭、狂笑、暴怒）时考虑；rich 时，主要人物可以做表情差分，不限于夸张的表情，选在故事中会多次用到或有助于塑造人物的表情，如惯有的冷笑、强忍的泪、难得的笑容；主要人物以外，性情大变、反派露出真面目等有表现效果的转折处也考虑表情差分。表情差分只写 face：原样沿用默认设计的面部身份特征，再用一个简短的英文短语点明这一表情（如 weeping、a cold sneer、a rare soft smile），最多补一处最显著的外在迹象；不逐项描写肤色、眼部、泪痕、口型与头发的变化，body 沿用默认设计；多用区间记录覆盖表情持续的几屏，之后回到当时的状态。
variants 只定义本章首次使用的新差分，每项 {"id":"本章ID.简短英文","entityId":"人物或地点ID","name":"简短中文名","reason":"使用理由", ...}。人物差分写 face 和／或 body 的完整替换值，未写的字段沿用默认设计；保留同一人物的身份特征，写清这一状态下的可见变化，body 同样只写大腿中部以上。默认设计里有、这一状态下不在的衣物、配饰或携带物（如背着的剑、帽子），在 body 末尾写明不带（如 no sword on his back）：差分图由默认图编辑而来，没写明的会保留。年龄阶段、长期换装等明显变化的差分，body 可写新的姿态与动作，身体仍大致向画面右侧侧身。身高与默认设计不同的年龄阶段差分写 stature（默认设计是儿童而差分是成人时写 1），未写的沿用默认设计。地点差分写完整 prompt，保留主图的空间布局、建筑与视角，写清状态变化与光照。name 用两到六个字概括最显著的变化，并且在首次使用处已可公开。已定义的差分（含全书设计登记、尚未使用的）在 states 中直接引用原 ID，不再定义；同一状态始终引用同一 ID。
states 记录本章实体处于哪个差分，每项 {"entityId":"人物或地点ID","from":"本章单元ID","to":"本章单元ID","variant":"差分ID"}。省略 to 为持续记录：从 from 起一直有效并延续到后章，直到该实体的下一条持续记录；variant 为 null 表示回到默认形象。写 to 为区间记录：只在本章 from 至 to（含首尾）有效，结束后回到当时的持续状态。同一实体的区间记录互不重叠，持续记录不从区间内部开始。地点记录的起止单元位于该地点，通常覆盖整场。新定义的差分须在本章使用。variant 只决定实体出现时用哪张图，不决定人物是否站在画面上。
伪装、易容等身份诡计中，默认形象是读者最先看到的样子；揭示后的真实形象作为差分，从揭示处开始。
<!-- /prompt -->

## director11.variants-input

<!-- prompt:director11.variants-input -->
已定义的差分：⟪variants⟫
本章开始时各实体的持续状态（未列出的为默认形象）：⟪states⟫
主要人物：⟪main⟫
每个主要人物全书最多 4 个差分，其他人物 1 个，每个地点 2 个。允许 variants 与 states 为 []。
<!-- /prompt -->

## director11.image-limit

<!-- prompt:director11.image-limit -->
全书图片总数上限 ⟪limit⟫ 张（各类图片合计，含封面、立绘与差分；复用已有图片不计数），已登记 ⟪used⟫ 张，还可新增 ⟪left⟫ 张，不得超出。
<!-- /prompt -->

## director11.ambient-input

<!-- prompt:director11.ambient-input -->
全书已定义的氛围图（fromDesign 为全书设计登记、尚未使用的）：⟪ambients⟫
<!-- /prompt -->

## director11.cut-in-input

<!-- prompt:director11.cut-in-input -->
全书已定义 Cut-in：⟪cutIns⟫
复用已有 Cut-in 时只在 cutInUses 中写其 ID。
<!-- /prompt -->

## director11.staging

<!-- prompt:director11.staging -->
## 立绘出场
阅读时，人物在 scene 中开口（对白或心声）时以立绘上场；本场不再开口、或接下来 10 轮对话内不再开口时，在别人开口时退场，再开口时重新上场，但本场最后一轮对话之前刚说过话的人留到本场结束；同屏人数满时，最久没说话的人先退场。旁白中台上只有一人被提及时，此人站到前方。narration 与 document 不显示立绘，guest 不上场。这条规则符合原文时不写记录。
规则与原文不符时，在 states 中用 present 修正，每项 {"entityId":"人物ID","from":"本章单元ID","to":"本章单元ID","present":true}：
- present:true 并写 to：这段内人物站在画面上，开口之前、不开口时也显示（台上站满时让位给说话的人，有空位再回来）；用于场面进行中才进入现场的人物，from 写其进入的单元，to 写其离开的单元或本场最后一个单元；范围结束即退场，之后再说话时按规则重新上场。场面开始时已经在场的人物不写 present:true，开口时自然上场，不开口却需要露面时用镜头区间。
- present:false 并写 to：这段内人物不上场，用于说过话后中途离开的人物（from 写其离开后的首个单元，to 写其回来前的最后一个单元或本场最后一个单元），以及不在现场却仍在说话（隔门、电话、广播、传音）的人物。
- present:false 省略 to：从 from 起一直不上场并延续到后章，用于第一人称叙述者，以及始终只以声音、书信出现的人物；之后要恢复规则时，再写一条省略 to 的 present:true。第一人称叙述者在本章首个单元写一条，已在输入中列出的不再重复。
起止落在人物实际进入、离开或开始、结束通话的单元，按场面写范围，不逐句调整。只被提及、回想或谈论的人物不上场。同一人物的 present 区间互不重叠；同一范围也需要差分时，variant 与 present 可写在同一条记录中。
## 镜头区间
规则排出的画面与原文段落不合时，在 stages 中指定这段画面上站的人物，每项 {"from":"本章单元ID","to":"本章单元ID","cast":["人物ID"]}，cast 为 0—3 个有立绘的人物，按从左到右的顺序：
- 以几屏以上的篇幅专写一位人物（外貌、衣着、来历、心理、动作）的叙述：cast 只写此人，此人独自居中。
- 人多的场面中两三人之间持续较长的对话：cast 写这几人。
- 在场却不开口的人物：旁白写到其在场、其神态动作，或以间接引语转述其话语，而规则因其未开口没有让其上场时，cast 写入此人与同段说话的人物，from 写首次写到其在场的单元。场面开始时已在场的人物用这种方式上场，不写 present:true。
- 场景全景、人群、行军与战斗、与在场人物无关的议论：cast 写 []。
范围内画面上只有 cast 中的人物，从 from 起即站在画面上；cast 以外的人物说话时以头像显示。范围结束后回到出场规则。from 写段落的第一个单元，to 写段落的最后一个单元；区间在同一个 scene 内、互不重叠。规则排得对的段落不写。
<!-- /prompt -->

## director11.design-conflicts

<!-- prompt:director11.design-conflicts -->
## 设计与原文的出入
输入的既有人物设计与地点主图照常逐字沿用，不在 characters 或 backgrounds 中改写。本章原文对某个人物或地点有明确的外观描写，与输入的设计矛盾时（人物的发色、瞳色、年龄、体型、标志性衣着；地点的空间、建筑、材质与陈设），在 designConflicts 记一条 {"entityId":"人物或地点ID","unit":"写到这处描写的本章单元ID","note":"原文的写法与设计的写法"}，如 {"entityId":"c002","unit":"b003_s01:4","note":"原文：火一般的红发、暗茶色眼睛；设计：short black hair, dark eyes"}。设计没写到的细节，以及临时的伤势、换装、天气与光照，不算矛盾。没有出入时 designConflicts 为 []。
<!-- /prompt -->

## director11.staging-input

<!-- prompt:director11.staging-input -->
本章开始时持续不上场的人物：⟪offstage⟫
<!-- /prompt -->
