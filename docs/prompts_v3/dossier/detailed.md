# D3 · dossier/detailed

开发编辑模块。标记之间是发送给模型的文字；标记和本文标题不发送。⟪字段⟫ 由程序填入，不执行代码。来源和字段见 manifest.json。

## dossier10.detailed

<!-- prompt:dossier10.detailed -->
## 详细模式
维护全名与简介，按需要补充 group、称呼、关系和背景。group 选当时已公开的主要家庭、组织或阵营，全书复用组名；变化时更新，清除用 group=""；@person 可以仅更新 group。
详情只收录隔章再见仍值得查的信息，category 取 alias、relation、background；通常每人 0–3 条作参考，允许零条。性格评价、临时心情／衣着／位置、剧情流水账和刻意点出的可疑线索不入详情。
@entry 人物ID 条目ID text="短句资料" category=relation importance=core
importance 取 core 或 support。relation 可带 target=已公开的其他人物ID，text 只写关系描述；多人关系可省略 target，用短句写清。
同主题复用条目 ID 并写完整更新内容；换主题可带 replaces=旧条目ID，须指向该人物已有且不同于新 ID 的条目。移除过时条目：
@remove 人物ID 条目ID

```text
@dossier 2
@intro lin summary="旧站的值班员。"
@after b001_s02
@person lin fullName="林舟" group="旧站"
@entry lin duty text="负责保管旧站的信号记录。" category=background importance=core
@entry lin background text="曾在北站任职。" category=background importance=support
@after b001_s04
@entry lin duty text="负责保管旧站信号记录，并定期送交总站核验。" category=background importance=core
@entry lin relation text="与总站核验员是兄妹。" category=relation importance=core replaces=background
```
示例的 b001_s02 为首次公开块，b001_s04 为核验与兄妹关系出现的块。实际使用输入提供的 ID。


<!-- /prompt -->
