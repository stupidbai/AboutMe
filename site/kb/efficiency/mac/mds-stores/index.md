---
title: "Mac系统优化-关闭mds_stores"
description: "Mac系统优化-关闭mds_stores的历史知识归档。"
date: "2025-02-12 12:23:42"
author: "白云飞"
originalAccount: "arch3rPro"
originalSource: "https://github.com/arch3rPro/arch3rpro.github.io/blob/acf58fa03821905916b0fc605ec893eadf6063fe/posts/efficiency/mac/mds-stores/README.md"
sourceCommit: "acf58fa03821905916b0fc605ec893eadf6063fe"
isReference: false
outline: deep
---
> 历史知识归档：由白云飞以 arch3rPro 账号首次发布，本次经本人授权迁移。原始发布日期：2025-02-12 12:23:42。

# 关闭mds_stores

:::tip
今天发现Nuc8 黑苹果的风扇开机狂转，看了下进程，mds_stores占用120%，搜了下解决办法记录在此
:::

## 执行命令

```shell
# 关闭聚焦索引文件功能
sudo mdutil -a -i off

# 如需开启，执行以下命令
sudo mdutil -a -i on
```

## 参考资料

* mds-stores-use-high-cpu（`https://www.xtplayer.cn/macos/mds-stores-use-high-cpu`）

---

本地归档：`posts/efficiency/mac/mds-stores/README.md` · 源提交：`acf58fa03821`
