# C2 · 共用修复

已改过阶段的三个片段 auto.repair.part1、repair.dossier-missing、director.repair 保持正式稿文字。

## repair.annotation

<!-- prompt:repair.annotation -->
原书注解 ⟪sourceId⟫ 未提供可读内容，允许按无注解内容处理，无需补齐。
<!-- /prompt -->

## repair.source-id

<!-- prompt:repair.source-id -->
来源编号疑似前导零误写：⟪actual⟫ → ⟪expected⟫。对照编号原文，确认后逐字采用实际来源 ID。
<!-- /prompt -->

## repair.location

<!-- prompt:repair.location -->
核对地点 ⟪firstId⟫「⟪firstLabel⟫」与 ⟪secondId⟫「⟪secondLabel⟫」是否为同一处。原文证实相同时复用稳定 ID 与首次已知 label，后续名称保留在正文；证据不足或实为两处时保留区分。
<!-- /prompt -->

## repair.entity-conflict

<!-- prompt:repair.entity-conflict -->
实体 ⟪id⟫ 的初始称呼／类型／颜色与前批冲突。确为同一对象时沿用首批声明；人物新公开名在相应正文处用 @reveal 的 label 更新，地点后续名称保留在正文。若实为不同对象，依本批新增实体规则区分 ID。
<!-- /prompt -->

## repair.dossier-missing

<!-- prompt:repair.dossier-missing -->
人物简介缺项：⟪characters⟫。每位已公开人物至少需要一句有原文依据的简介；首次公开在本次完整块内可用 @intro，否则用本次 @after 下的 @person summary 补齐。不得用空白或“？？？”占位，不要求详细条目。请返回完整替代稿。
<!-- /prompt -->

## director.repair

<!-- prompt:director.repair -->

本次旧稿：
⟪draft⟫
程序报错：
⟪errors⟫
修复并返回完整替代稿，保留正确内容。
<!-- /prompt -->
