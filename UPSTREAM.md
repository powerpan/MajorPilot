# 上游与本地工具链基线

导入日期：2026-09-20。源码固定到明确 commit，不自动追踪分支，不在 P0 顺带升级框架。

| 组件 | 官方来源 | 固定版本／提交 | 许可证 |
| --- | --- | --- | --- |
| RuoYi 后端 | [RuoYi-Vue](https://github.com/yangzongzhuan/RuoYi-Vue) `springboot3` | `a51a838b71b446ea27256900efe7ed2faa2a02fd`，3.9.2 / Boot 3.5.16 | [MIT 原文](backend/LICENSE) |
| RuoYi Vue 3 TypeScript 管理端 | [RuoYi-Vue3](https://github.com/yangzongzhuan/RuoYi-Vue3) `typescript` | `0ea09ef814213875b61cffb3485d76de680256f3` | [MIT 原文](admin-web/LICENSE) |
| Java | 当前本机 OpenJDK | 21.0.10，源码级别 17 | 不将本机 JDK 二进制入库 |
| Maven Wrapper / Maven | Apache Maven | 3.3.4 / 3.9.16 | wrapper 保留 Apache 头 |
| Node / npm | Node.js / npm | 24.21.0 / 11.19.1 | 本地工具目录保留附带许可 |
| MySQL | Oracle Community Server | 8.4.11 macOS 15 ARM64 tar | GPL；本地工具，不入库 |
| Redis | Redis 官方 7.2 系列 | 7.2.16 源码本地编译 | 上游 7.2 附带 BSD 许可；不入库 |
| Mailpit | [axllent/mailpit](https://github.com/axllent/mailpit) | 1.31.2 macOS ARM64 | 本地捕获器，不入库 |

[后端详细导入与修改记录](UPSTREAM-backend.md)和[管理端详细导入与修改记录](UPSTREAM-frontend.md)分别记录原样构建、最小修改和验证边界。上游 README、示例 SQL 及原有注释是来源材料，不覆盖 MajorPilot 的根 README 与当前安全配置。

## 完整性与下载

源码压缩包 SHA-256：

- 后端：`e51805ab941083c558d5a3d510390c379beb8839cc89b267a99ea8f43c74f3c5`。
- 管理端：`0189bf80c6c3802e29adafe2fc84af629626f247a24a1e1310367af55446bd3f`。

本地下载地址和校验值固定于 [install-tools.mjs](scripts/install-tools.mjs)。Node 校验值来自官方 SHASUMS；npm 来自 registry 的 SHA-512 integrity；Redis 来自官方 redis-hashes；Mailpit 来自官方 GitHub release digest。MySQL 首次下载核对 Oracle 发布的 MD5 后，额外记录 SHA-256 并用于后续安装。校验固定下载内容，不等于独立安全审计或系统级安装。

工具与数据都在忽略的 `data/`，未修改 Homebrew 全局版本，未操作现有 3306、6379 等服务。Redis `--version` 的构建 Git 字段可能继承父目录 MajorPilot 的 Git 信息；下载包版本及 SHA-256 才是其来源标识。

## 更新规则

后续只选择性吸收明确的安全修复或缺陷修复。每次升级独立记录差异、迁移影响和回归结果；禁止直接覆盖主线、自动换 RuoYi 分支或编辑已经执行过的 Flyway 迁移。P0 合成表后续如需清理或变更，应追加迁移，不把技术探针直接当成正式学生业务表。
