# D5 · dossier/output

开发编辑模块。标记之间是发送给模型的文字；标记和本文标题不发送。⟪字段⟫ 由程序填入，不执行代码。来源和字段见 manifest.json。

## dossier10.syntax

<!-- prompt:dossier10.syntax -->
## 共用协议
指令独占一行，字符串不跨行。ID 以英文字母开头，其他字符只用英文字母、数字、_、-，none 为保留值。属性 key=value，含空白加双引号；字符串内双引号转义为 \"，反斜杠为 \\。
首次简介全书每人仅一条：
@intro 人物ID summary="一句话简介"
其他事件先写 @after 块ID（复制目标 block 值），再写：
@person 人物ID fullName="已公开全名" summary="更新后的简介"
fullName 与 summary 可分别省略，但至少更新一个字段。fullName 是人物资料中的完整姓名，正文当前显示名由 publicNames 决定，可保持简称；全名完全公开后再登记。只有身份、所属或基本关系实质变化，或读者对其身份的认知改变时才更新简介；行动和剧情进展不写入简介，也不因此更新。


<!-- /prompt -->
