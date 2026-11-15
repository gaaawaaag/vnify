# B6 · body/continuity-inheritance

开发编辑模块。标记之间是发送给模型的文字；标记和本文标题不发送。⟪字段⟫ 由程序填入，不执行代码。来源和字段见 manifest.json。

## body.continuity

<!-- prompt:body.continuity -->
## 人物称呼与新增实体

- 表内人物和地点直接引用 ID；声明区只写本批新增对象。新增人物使用首次出现时已知的称呼与固定颜色，新增地点使用具体空间名。
- 本批起点称呼见所附参考。`@reveal 人物ID label="新名"` 记录本批原文中新发生的公开或改名，放在对应正文之前；日常别称用行内称呼表达。
- 未列出但对情节重要的人物或实际场景地点可以新增；临时搭话者、背景群众使用 guest，叙述中保留普通文字。


<!-- /prompt -->

## body.entity-state

<!-- prompt:body.entity-state -->
⟪kind⟫ ⟪id⟫：初始称呼=⟪label⟫⟪color⟫
其他称呼：⟪aliases⟫
当前公开状态：⟪state⟫
<!-- /prompt -->

## body.empty-registry

<!-- prompt:body.empty-registry -->
人物与地点表为空，本批使用的实体在章节前声明。

<!-- /prompt -->
