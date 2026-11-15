# 生图与作品包

是否生图由交付结果决定（见主技能“开始：方案与预算”）。用户选定后按指定范围执行，无需逐图征求确认。选了自带工具就用当前 agent 的图像生成工具；用户指定 ComfyUI 时使用其提供的地址与 API 工作流。不需要 agent 生图或宿主工具不可用时，交付嵌入提示词的 VN 文件（见主技能“只做提示词时”）。订阅额度、计费及可用模型以宿主当次能力为准；使用 API 密钥的独立付费路径需用户选择。

内置生图按宿主工具或 imagegen skill 的要求调用。--jobs 每项的 prompt 已由程序组装好人物描述、画风及用途模板，是这张图的内容规格：内容照用，不另行拼接设计；制作环境有 `image-models/<模型>.md` 时，按其中说明调整语言、结构、长度与参数写法。保存工具实际返回的图片到工作目录。ComfyUI 使用用户提供的 API 工作流、地址和节点映射；缺少必需配置时集中询问。

## 生成方式

文生图、参考图生成与图像编辑都是可用的工具，按手头工具与任务选择：

- `prompt`：文生图，始终提供。
- `references`＋`referencePrompt`：清单 `references` 登记了相关参考图时提供（人物图找该人物，差分只找该差分登记的参考图，地点背景找该地点，CG 按导演的 `cast` 找人物（每人取第一张登记的参考图，按顺序编号为 image 1、image 2…；没有 `cast` 的 CG 不附人物参考图），Cut-in 找 `cutInId` 相同的参考图；CG 另找来源范围与它重叠的高光图，作为构图参考）。暂时用不上的参考图列在 jobs 的 `unusedReferences` 并写明原因：正文没有该实体（登记 ID 不同时改 entityId）、非默认形象（stage）还没有 variantId、道具还没有 cutInId、还没有 CG 覆盖高光图的那段正文。导演登记差分或 Cut-in 后，在参考图清单里补上对应的 `variantId`／`cutInId` 再列任务。工具支持参考图输入时，把这些文件作为参考、用 `referencePrompt` 生成；不支持时用 `prompt`。路径相对 jobs 文件所在目录。
- `editPrompt`＋`referenceFile`：差分任务提供，以已绑定的默认图为输入编辑，一致性最好，优先使用；没有图像编辑工具时用 `prompt` 按差分完整设计文生图，生成后对照默认图检查身份特征，交付时说明一致性可能较差。

`image-models/` 不入作品包。用户说明所用模型或渠道而没有说明文件时，查该模型的官方文档写一份：适合的语言与长度、结构、是否支持负面提示词、透明背景、参考图与编辑、比例参数。用户提供的说明优先。

## 用管理器的生图设置

清单有 `imageScheme` 时，生图走资产管理器“生图服务”里填好的预设与密钥，不用宿主工具：

```sh
node scripts/draw-images.mjs "work/project.json" --list --missing
node scripts/draw-images.mjs "work/project.json" --missing --limit 6
node scripts/draw-images.mjs "work/project.json" --draw <key,key>
node scripts/draw-images.mjs "work/project.json" --prompt <key>[#edit] --text-file <文件>
node scripts/draw-images.mjs "work/project.json" --crop <立绘key> [--clavicle 0.31] [--save]
```

- `--list --missing` 列出缺图：`key`、所用预设、请求尺寸 `request` 与将要发送的提示词（`promptSource`：manual 手动改写、formatted 改写稿、composed 组装稿）。有 `problem` 的图没有对应预设或没有提示词，不会生成；有 `pending` 的说明预设要求改写而这张还没有改写稿，先改写再生成。已绑定的图另列实际尺寸 `size`；模型只出固定尺寸或工作流带超分时，实际尺寸与请求不同，比例相近即可，不因此重画。
- `--missing` 按封面、氛围图、地点、立绘（默认图在差分前）、CG、特写的顺序生成缺图，CG 能用到已绑定的立绘作参考，差分以默认图为底。每次 `--limit` 几张，看完这一批再继续。输出逐张列出 `state`（done／failed／skipped）、错误与生成的图片文件 `file`。生成会调用付费服务时，范围以用户的交付要求为准。
- 每张 done 的图都打开 `file` 查看，按下文“排定与检查”的标准检查。只处理严重问题：人物、地点或物件与描述明显不符（性别、年龄、发色、服装、人数不对，多出或缺了人），CG 出场人物错误，立绘取景不是头顶到大腿中部或头被切掉，画面有文字或水印，四肢、手、脸严重畸形，透明立绘仍带背景。信纸、书页、招牌、屏幕这类本来带字的物件上出现无法辨认的伪文字不算严重问题：不少生图模型难以避免，除非用户或这张图的要求明确写了不能有，否则不为它重画。构图偏好、画风细节和轻微瑕疵不重画。
- 有严重问题时，按问题改写这张图的提示词：先用 `--list` 取当前提示词（`prompt` 是可改的文字；CG 的出场人物说明在发送时补上，`sent` 是补上后的全文，不要把它当作改写的底稿；`@1`–`@3` 照原样保留），保留画风、用途模板与取景句（立绘的取景句逐字保留），只针对出错的部分加强或改写描述，写进文件后用 `--prompt <key> --text-file <文件>` 保存（即管理器里的“手动改写”，之后生成都发送它；`--clear` 清除），再 `--draw <key>` 重画。差分由默认图编辑生成时，发送的是 `--list` 里的 `editPrompt`，改它用 `--prompt <key>#edit`。同一张图最多改两轮；仍不行就在清单 `holds` 写明原因，继续其他图，交付时说明。只是偶发的坏图（提示词没问题）可以不改提示词直接重画一次。
- failed 的图先看错误：缺密钥、服务连不上、工作流缺失时告诉用户去生图服务页检查，不反复重试；超时或限流时稍等再重画。

立绘（含差分）绑定后裁出头像框，标准是从头顶上方一点点空白到锁骨中间（框顶留出框高 5% 的空白，播放器据此统一各人头的大小与发顶位置）：

1. `--crop <key>` 从透明立绘量出发顶与头部中线，估一个锁骨位置，写出两张预览：`preview`（裁出的方形头像）和 `guides`（整张立绘，红框为裁切范围，两侧蓝色刻度每 5% 图高一格、每 10% 一条长刻度）。
2. 打开两张预览检查：框顶在发顶上方、只留一点空白，框底在锁骨中间，头在框的左右正中。估计不对（长发遮住脖子、抬手、侧身时常见）时，从 guides 的刻度读出锁骨中间所在的图高比例，用 `--clavicle 0.31` 重算；发顶量错（如帽子、发饰、呆毛）时用 `--top`，头不在正中时用 `--center`（图宽比例），都可写像素。
3. 预览符合标准后加 `--save` 保存，写入清单该立绘的 `crop`。输出带 `warning`（发顶贴着图顶、框顶留不出空白）时照样保存；这类立绘头部过满，严重时（头顶被切掉）按上面的严重问题重画。

立绘不是透明背景时量不出发顶，`--top` 与 `--clavicle` 都要给。只能量 PNG：用宿主工具生图、登记的是 WebP 时，加 `--file <PNG 原图>`（与登记的图同尺寸）量取并保存，`--crop` 同样适用于用宿主工具生成并登记的立绘。

## 排定与检查

校验导演稿并列出当前范围缺图：

```sh
node scripts/direct-vn.mjs "work/project.json" --jobs --out "work/jobs.json"
```

输出三部分：`directors` 是各选定章节的导演状态（complete／pending 及原因），尚缺章节时不能称全书导演完成；`jobs` 是可执行的缺图任务；`held` 是暂缓的任务及原因（差分等默认图、或清单 `holds` 登记的）。已绑定的目标不再出现，绑定以作品包与 `images` 为准，无需另记进度。

每项任务带 `taskIds`（用途与绑定目标，如 `background:locations:hall`、`standing:lin`）。某个目标因身份／地点疑点或连续失败需要暂缓时，在 `project.json` 写 `"holds":{"任务ID":"原因"}`，原因必填；它会移到 `held`，同一提示词的其他目标照常排队。解除暂缓时删掉该项。暂缓原因随清单交接，不只写在笔记中。改动已绑定图片的提示词后，程序不会自动重排；需要重绘时在 `images` 中对该图加 `replace:true`。

`jobs` 每项含 `purpose`、`prompt`、`aspectRatio`（按它出图：背景、氛围图与 CG 为清单 `ratio`，封面 16:9，特写 1:1，立绘 2:3）及绑定目标，共用目标已去重。背景可包含多个 `refs`，共用同一张图；角色图片以全书最新的人物设计为准。立绘任务包含 aspectRatio="2:3"，透明方式以任务 transparentBackground 为准：Codex 内置工具将它映射为 transparent_background；透明图保存 PNG／WebP 并检查真实 alpha。清单 `transparencyMethod:"cutout"` 时，透明人物图的任务改为 `transparentBackground:false`、`removeBackground:true`，提示词要求纯色背景，保存为 PNG。生成后去背：用户指定了去背工具（如 ComfyUI 工作流）时用它；否则运行 `node scripts/cutout.mjs 原图.png --out 透明.png --preview 预览.png`，它以四边的颜色为背景色，去掉与边缘相连及被人物围住的大块背景，并把边缘像素按与背景的混合程度改为半透明、去掉背景色。命令报告四边不是纯色时重新生成；有 warnings 或预览（灰色棋盘格上的结果）里人物缺块、边缘留有背景色时，可调 `--tolerance`（默认 24 起随噪点自动增大；调大去得更多）或加 `--keep-holes`（保留被围住的同色块，如与背景同色的衣物），仍不理想就换一个与人物差别更大的背景色重新生成。去背后的 PNG 按下文转为 WebP 再登记，预览只用于检查。登记的仍须是带真实 alpha 的 PNG／WebP。返回尺寸以实际文件为准；不合比例先修正再登记，不把背景棋盘格当透明。仅生图范围比提示词范围小时，为生图清单选择对应 `chapters`（已完成提示词可作为新 input），或按用户范围从任务中选取。

逐项生成，查看实际图片：背景内容、年代、可用构图与章首剧透；角色五官差异、发型完整、服装及构图；立绘另查头顶至大腿中部的完整轮廓、朝向与动作是否按描述，透明任务检查真实 alpha。检查后把成功项转为 WebP（见下段），登记尺寸与绑定。失败保留其他成功结果；在用户预算内修复，单项连续两次失败先记录并继续可完成部分，交付时说明。用户要求审批或预览时按其流程执行。

**转为 WebP**：每张图检查通过后（cutout 时在去背之后）、登记之前转为 WebP，登记 WebP 文件，原图留在制作目录不进作品包。用宿主环境已有的工具，如 `cwebp`、ImageMagick（`magick`）、Python Pillow 或 ffmpeg；有损编码，质量 85–90；保持原尺寸，不缩放、不裁切；透明图保留完整 alpha（如 `cwebp -q 88 -alpha_q 100 -exact 原图.png -o 图.webp`，Pillow 保存 RGBA 时不转 RGB）。转换后核对：尺寸与原图一致，透明图仍有真实 alpha，人物边缘与暗部没有明显色块或发灰；文件不比原图小时登记原图。环境中没有可用工具时登记原图，交付时说明并建议用户安装 cwebp 等工具。已登记的旧图不回头重转，用户要求时再转。用户提供的图片与差分同样处理。

CG 按导演条目 ID 单独绑定，只在其正文范围显示。其余绑定是每地点一个背景、每个氛围图一张（各章复用）、每角色一张全局默认立绘；修改这些会影响其全部使用位置。立绘共用于对话框、Cast 和人物页，头像由播放器从立绘裁出。换装、受伤等随剧情变化的形象用差分（见下文），六格头像不属于本流程。

## 登记与打包

阶段交接只需原制作目录：`project.json`（含 `holds`）、导演稿、设计与图片文件；接手方先运行 `--jobs` 重验。

将实际图片信息写入 `project.json` 的 `images`：

```json
[
  {
    "file": "images/ch01.webp", "purpose": "background",
    "width": 1536, "height": 1024,
    "refs": [{"scope":"ambients","id":"ch01.ambient01"}]
  },
  {
    "file": "images/lin.webp", "purpose": "standing",
    "width": 1024, "height": 1536, "characterId": "lin"
  }
]
```

尺寸取自真实图像的检查结果，不填预期请求尺寸。可选记录生成方式 `"mode":"generate|edit|reference"` 与按模型调整后实际发送的 `"sentPrompt"`，只留在清单中，不进作品包；Gallery 与人物页仍显示规格版提示词。支持 PNG、JPEG、WebP；打包工具检查类型签名、尺寸数值与大小限制、绑定 ID，并计算内容 hash，但不解码像素验证实际尺寸，agent 需用可用图片工具核对。

已绑定的立绘（含输入作品包里的）用 `{"purpose":"standing","characterId":"lin","remove":true}` 移除，或用 `"adjust":true` 加 `flip`／`crop` 只改设置、不换图；差分加 `variantId`。

立绘 purpose 为 standing，原图须为约 2:3（偏差 3% 以内）的 PNG／WebP，透明任务保留原始透明通道。播放器把所有立绘按同一图片高度显示、发顶对齐，不按头大小缩放，所以各人立绘要统一取景（cowboy shot：头顶贴近图顶、画到大腿中部），取景明显不同（只到腰部、画到膝盖）的图重新生成；人物高矮只用 `stature` 表达。立绘可加 `crop:{"x":0,"y":0,"size":1024}` 指定头像在原图内的方形裁切（省略时按标准 cowboy shot 裁出头与锁骨）；每张立绘登记后按上文“用管理器的生图设置”中的头像框步骤用 `--crop` 量取并保存；保存了 crop 的立绘在播放器里改按头像框定大小与发顶（框从发顶上方一点到锁骨以上），取景不同的图也能显示成同样大的头，以及 `flip`（`left`／`none`，省略为站在右侧时镜像）。背景 `refs.scope` 为 `chapters` 或 `locations`。默认保留已经绑定的图；明确重绘／替换时在该图片项加 `"replace":true`。导出现行版本的作品包。

```sh
node scripts/direct-vn.mjs "work/project.json" --out "work/story.vn.zip"
```

工具复用播放器导出器写入正文、Director、图片及绑定；不要用通用 ZIP 工具重新压缩。每轮补图后重新导出，重新列任务时只会出现尚缺的绑定。保留本地制作清单与原图，不将密钥写入作品包。


CG 任务 purpose 为 `cg`，沿用背景尺寸／工具配置，refs 为 `[{"scope":"cgs","id":"ch01.cg01"}]`。按导演选定场面检查构图，人物外貌衣着与已有设计一致，画面适合其显示范围和阅读节奏。上传登记使用同样 purpose／refs，replace:true 明确替换该 CG；不与背景按提示词合并。背景与 CG 可用匹配 refs 的 remove:true 移除。CG 不进入 Gallery。

差分任务带 `variantId`：`referenceFile` 是已绑定的默认图（人物为默认立绘，地点为主图），`editPrompt` 是编辑指令，`prompt` 是差分完整设计的文生图提示词（生成方式见上文）。用户提供 ComfyUI 时，编辑须是带图像输入的工作流。人物差分沿用 `standing` 用途；地点差分为 `background`，refs 为 `[{"scope":"variants","id":"差分ID"}]`。默认图绑定前差分任务暂缓，所以先完成默认图。生成后检查人物身份特征与默认图一致、地点空间布局与主图一致。登记时人物差分加 `"variantId":"差分ID"`（如 `{"file":"images/lin-wet.png","purpose":"standing","width":1024,"height":1536,"characterId":"lin","variantId":"ch03.lin-wet"}`），地点差分用 variants refs；replace／remove 规则同上。

作品封面任务 purpose 为 `title-card`，16:9，沿用背景工具配置与人物画风，没有 refs；图上不要出现文字。登记为 `{"file":"images/cover.png","purpose":"title-card","width":1600,"height":900}`，replace:true 替换，`{"purpose":"title-card","remove":true}` 移除。
