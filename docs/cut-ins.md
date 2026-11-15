# 特写插图（Cut-in）

**Cut-in** 用于在阅读过程中展示关键道具、信物、线索或局部环境细节的特写插图。特写插图由导演记录中的 `cutIns` 与 `cutInUses` 字段定义，无需在 `.vn.txt` 正文内插入占位指令。

---

## 数据结构与跨章复用

在章节导演记录中，特写插图分为**图像定义（`cutIns`）**与**显示区间（`cutInUses`）**两部分：

```json
{
  "cutIns": [
    {
      "id": "brass-key",
      "reason": "带有特殊刻痕的黄铜钥匙。",
      "prompt": "A vintage brass key with a distinct scratch on its round bow, macro close-up on dark wood."
    }
  ],
  "cutInUses": [
    {
      "cutInId": "brass-key",
      "from": "s01:1",
      "to": "s01:3"
    }
  ]
}
```

- **图像定义（`cutIns`）**：仅登记本章首次使用的新特写图。
  - `id`：全书唯一的标识符（匹配 `[\w.-]{1,160}`）。
  - `reason`：安排该特写的剧情依据。
  - `prompt`：描述物品外观、构图与光影的英文提示词；程序在生成生图任务时会自动拼入全书背景画风。
  - 本章新定义的每个特写 ID 均须在本章的 `cutInUses` 中至少使用一次。
- **显示区间（`cutInUses`）**：列出本章内所有特写插图的展示范围。
  - `cutInId`：引用本章新定义或前文章节已定义的特写 ID。
  - `from` / `to`：本章内的起止正文单元 ID（含首尾）。同一章内多个 `cutInUses` 的区间互不重叠，但可与 CG 的显示区间重叠。
- **跨章复用**：后续章节再次展示同一物品时，`cutIns` 保持为空（或仅含其他新图），直接在 `cutInUses` 中引用已有 `cutInId`，复用不计入新增图片额度。

---

## 生图与资产绑定

- **开启与疏密**：在导演配置（`options`）中设置 `cutIns: true`，疏密由 `density.cutIns`（`few` / `medium` / `rich`，默认 `few`）控制。
- **生图任务**：`--jobs` 按特写首次出现的章节生成生图任务，用途标识为 `purpose: "cut-in"`，默认画幅比例为 `1:1`。同一 `id` 全书仅生成一次。
- **清单登记与作品包绑定**：
  - 在导演制作清单 `project.json` 的 `images` 中，按如下格式登记图片：
    ```json
    {
      "purpose": "cut-in",
      "file": "images/key.webp",
      "width": 1024,
      "height": 1024,
      "refs": [{"scope": "cutIns", "id": "brass-key"}]
    }
    ```
  - 导出作品包时，特写图片按 `id` 绑定在背景资产清单的 `bindings.cutIns` 中，详见 [背景与作品包资产](background-assets.md)。
- **阅读展示**：当阅读进度处于 `[from, to]` 区间时，特写插图居中浮现于画面上方，支持点击放大查看原图或临时收起。EPUB 原书中的正文内插图同样复用此位置展示。

完整脚本示例见 [examples/cut-in.vn.txt](../examples/cut-in.vn.txt)。
