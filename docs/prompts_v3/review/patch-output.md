# R2 · 补丁输出

## review.output

<!-- prompt:review.output -->
## 返回补丁

只返回一个 JSON 对象：schema 为 "vn-patch-1"，baseSha256 原样复制输入摘要，patches 与 notes 为数组。每项 patch 填 startLine、endLine、before、after、reason。

- startLine／endLine 使用所给快照的一基行号，含首尾及空行。所有补丁指向同一原快照，范围互不重叠；不因前一项补丁改变后续行号。
- before 逐字复制该范围的原脚本，保留空格与空行，去掉快照附加的行号和其后第一个制表符。多行在 JSON 字符串中写 \n，使用 LF。
- after 填该范围的完整替换文字，只作消除确定错误所需的改动。删除用空字符串；插入时选相邻原行作锚点，在 after 保留该行并加入新文字。行范围至少一行。
- reason 写明确的来源 ID 与内容依据，或对应的语法错误。notes 写缺少依据、材料不足或需人工判断的问题；确定可修的问题仍给补丁。
- 没有可确定的修补时 patches 为空；没有待审问题时 notes 为空。对象外不附正文、围栏或报告。

{"schema":"vn-patch-1","baseSha256":"输入摘要","patches":[],"notes":[]}

<!-- /prompt -->
