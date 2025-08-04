# koishi-plugin-rate-limit

[![npm](https://img.shields.io/npm/v/koishi-plugin-rate-limit?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-rate-limit)
[![GitHub](https://img.shields.io/github/stars/YisRime?style=flat-square)](https://github.com/YisRime)

限制指令和中间件的调用频率和每日调用次数。

## ✨ 功能特性

**🎯 双重目标**：同时支持对 **指令 (Command)** 和 **中间件 (Middleware)** 进行限制。
**🔧 灵活配置**：可对每个指令单独设置频率限制（冷却时间）、每日使用次数上限。
**🌐 统一范围控制**：支持以 **用户 (user)**、**频道 (channel)** 或 **全局 (global)** 为单位，统一管理所有频率限制的范围。
**💬 智能提示**：可配置在触发限流时，是否向用户发送人性化的提示信息。
**⚖️ 规则系统**：通过强大的规则列表，实现白名单（豁免）和黑名单（限制）功能。
**🔍 关键词匹配**：可针对消息中的特定关键词进行中间件限流，有效防止刷屏。

## ⚙️ 插件配置

插件的配置分为三个主要部分：**主配置项**、**单个指令配置** 和 **通用规则配置**。

### 1. 主配置项

这些是本插件的核心设置，用于控制全局行为。

**`scope`**: 统一的频率限制范围。此设置将同时应用于所有受限的指令和中间件。
  `user`：针对单个用户进行限制（默认）。
  `channel`：针对单个频道进行限制。
  `global`：全局共享同一个限制计数。
**`sendHint`**: `(布尔值)` 当用户操作被限流时，是否发送提示信息。开启后会发送“操作过于频繁...”等提示，关闭则静默处理（默认开启）。
**`limitMiddleware`**: `(布尔值)` 总开关，是否对非指令消息（如纯文本聊天）启用频率限制。
**`maxMiddlewareUsage`**: `(数字)` 中间件的每日总调用次数限制（0为不限制）。
**`minMiddlewareInterval`**: `(数字)` 中间件的连续调用最小间隔（秒，0为不限制）。

### 2. 单个指令配置

要对某个特定的指令进行频率或次数限制，你需要进入该指令自身的配置页面。在 Koishi 中，通常路径是 `Koishi 控制台 -> 插件 -> command`，然后找到目标指令。

**`maxUsage`**: 该指令的每日最大使用次数。设置为 0 则不限制。
**`minInterval`**: 该指令的最小调用间隔（单位：秒），即冷却时间 (Cooldown)。设置为 0 则不限制。

**示例：**
要让 `echo` 指令每个用户每 10 秒只能使用一次：

1. 在本插件（rate-limit）的主配置中，确保 `scope` 设置为 `user`。
2. 前往 `echo` 指令的配置，设置：
    `maxUsage`: `0`
    `minInterval`: `10`

### 3. 通用规则配置

规则系统提供了强大的自定义能力，可以让你精细地控制哪些目标需要被限制（黑名单），哪些需要被豁免（白名单）。

**`defaultAction`**: 默认行为，决定了本插件是作为黑名单还是白名单工作。
  `limit`: **黑名单模式**。默认限制所有目标，规则列表用于设置“豁免”的特例。
  `ignore`: **白名单模式**。默认不限制任何目标，规则列表用于设置需要“限制”的特例。

**`rules`**: 规则列表，每一项都是一个独立的规则对象。

  **`action`**: 匹配后的行为 (`limit`: 限制, `ignore`: 豁免)。
  **`applyTo`**: 规则生效范围 (`middleware`: 仅中间件, `command`: 仅指令, `both`: 两者都生效)。
  **`type`**: 匹配类型。
    `user`: 匹配用户 ID。
    `channel`: 匹配频道 ID。
    `keyword`: 匹配消息内容中的关键词（仅对中间件生效）。
  **`content`**: 要匹配的具体内容（用户 ID、频道 ID 或关键词）。

#### 规则示例 1：豁免管理员

假设你想限制所有用户，但豁免管理员（QQ号：`12345678`），可以这样配置：

1. `defaultAction`: `limit` (默认限制所有人)
2. 在 `rules` 列表中添加一条规则：
    `action`: `ignore` (豁免)
    `applyTo`: `both` (指令和中间件都豁免)
    `type`: `user` (按用户ID匹配)
    `content`: `12345678`

#### 规则示例 2：限制特定关键词刷屏

假设你想限制包含“晚安”的消息，每用户 1 小时只能发一次，可以这样配置：

1. 在主配置中开启中间件限制 (`limitMiddleware: true`)，并设置 `minMiddlewareInterval` 为 `3600` 秒。
2. 设置 `defaultAction`: `ignore` (默认不限制普通消息)。
3. 在 `rules` 列表中添加一条规则：
    `action`: `limit` (限制)
    `applyTo`: `middleware` (仅对中间件生效)
    `type`: `keyword` (按关键词匹配)
    `content`: `晚安`
