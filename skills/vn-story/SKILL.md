---
name: vn-story
description: 按用户提供的资料（角色卡、设定、梗概、方向性要求）创作完整的中短篇（篇幅按资料而定，约 2—5 万字），规划、逐章执笔、复核后交给 vn-convert 转成 .vn.txt，可继续 vn-director 配图。适用于“按这些资料写一个故事做成 VN”“开盲盒式短篇”等请求；可在任一阶段停下交付。实验性流程。
---

# VN 短篇创作

把用户的资料写成一篇完整小说，再按现有流程转成 VN。默认是开盲盒体验：用户在阅读前只看到无剧透简介，大纲、伏笔和结局留给作品本身。

## 角色与模型分档

流程分为几个角色，每个角色只读自己需要的文件（见下文“信息分配”）：

| 角色 | 档位 | 工作 |
| --- | --- | --- |
| 主控（你） | 创作档 | 整理资料、规划、组装执笔包、调度、复核 |
| 写手 | 创作档 | 按执笔包写一章 |
| 转换与导演 | 执行档 | 按 vn-convert／vn-director 转格式、写资料和导演提示词 |

创作档用当前可用的最强写作模型，执行档可用更便宜的模型；宿主能指定子代理模型时按 [宿主与子代理](references/harness.md) 分配，不能指定时全部用当前模型。写手和复核尽量用新上下文的子代理，这样写手读不到规划意图；没有子代理时由你依次执笔，并在 `notes.md` 记下隔离未生效。

## 制作目录

产物放 `works/<作品>/story/`（用户指定位置时沿用），用户原始资料可放 `input/`。续跑先读 `notes.md`。

```
story/
  notes.md              进度、各阶段所用模型、偏差与下一步
  brief/
    constraints.md      硬约束
    material.md         故事素材
    experience.md       用户对体验的回答（原话）
    assumptions.md      整理时做的判断及理由
    style.md            用户的文风说明（可选，给写手）
    style-sample.md     用户的例文（可选，给写手）
  plan/
    blurb.md            无剧透简介（给用户）
    bible.md            人物、声音规则、外貌、世界要点（给写手）
    beats.md            分章大纲（写手每次只拿本章一节）
    intent.md           伏笔与回收、母题、各章作用（只给复核）
    vn-notes.md         场景元数据与 CG 时刻（给转换与导演）
  packets/chNN.md       每章执笔包
  packets/summary.md    前情摘要
  chapters/chNN.md      各章正文（drafts/ 存原样返回）
  reviews/              复核记录
  manuscript.txt        合并后的全文
```

## 流程

1. **整理资料。** 按 [资料整理](references/intake.md) 产出 `brief/`，并问一轮体验问题。
2. **规划。** 按 [规划](references/planning.md) 产出 `plan/`。把 `blurb.md` 发给用户：用户可以调整或直接说开始；用户事先说过“直接写完”就不停顿。不向用户展示大纲、意图和结局，除非用户主动要求。
3. **执笔。** 按 [执笔](references/writing.md) 逐章顺序写。不并行执笔。
4. **复核。** 全部章节完成后按 [复核](references/review.md) 检查，把修改要求退回写手；你不直接重写章节。
5. **合并。** 按章序合并为 `manuscript.txt`，章标题独占一行（`第一章　标题`），保留场景标记供转换使用。只要小说时，另存一份把场景标记换成空行的 `novel.txt` 交付。
6. **转换。** 按 [转换登记](references/handoff.md) 由规划和成稿直接写出登记表与 `visual-profiles.json`，代替 vn-convert 的“通读与登记”；再用 [vn-convert](../vn-convert/SKILL.md) 从编号原文开始处理 `manuscript.txt`，制作目录放 `works/<作品>/convert/`。`brief/`、`intent.md` 不交给转换。
7. **导演与配图。** 用户要配图或导演提示词时接 [vn-director](../vn-director/SKILL.md)，把 `vn-notes.md` 的 CG 时刻作为选择 CG 的参考附在各章 packet 之后，导演仍按自身规则与预算决定。

用户可在任一步后停下：只要小说（第 5 步）、只要 `.vn.txt`（第 6 步）、带导演提示词、由用户自行配图（第 7 步不生图），或完整配图打包。开始时没说明的，默认做到含导演提示词的 `.vn.txt`（即“文字＋配图提示词”）；用户要完整配图时按 vn-director 的“开始：方案与预算”生图。

## 信息分配

| 文件 | 写手 | 复核 | 转换／导演 |
| --- | --- | --- | --- |
| brief/constraints.md | 否（写作相关规则已并入 bible） | 是 | 否 |
| brief/material.md、assumptions.md | 否 | 否 | 否 |
| brief/style.md、style-sample.md | 是 | 否 | 否 |
| plan/bible.md | 是 | 是 | 外貌部分 |
| plan/beats.md | 只给本章一节 | 是 | 否 |
| plan/intent.md | 否 | 是 | 否 |
| plan/vn-notes.md | 否 | 否 | 是 |
| 前文 | 上一章结尾原文＋前情摘要＋第 1 章节选 | 全部章节 | manuscript.txt |

## 交付

报告停在哪一步、产物链接、总字数与章数、各阶段所用模型档位、复核后仍保留的问题。不在交付说明里剧透情节；用户问起时再讲。
