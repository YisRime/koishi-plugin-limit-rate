# koishi-plugin-rate-limit

[![npm](https://img.shields.io/npm/v/koishi-plugin-rate-limit?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-rate-limit)
[![GitHub](https://img.shields.io/github/stars/YisRime?style=flat-square)](https://github.com/YisRime)

限制指令和中间件的调用频率和每日调用次数

## ✨ 功能特性

- **🎯 双重目标**：同时支持对 **指令 (Command)** 和 **中间件 (Middleware)** 进行限制。
- **🔧 灵活配置**：可对每个指令单独设置频率限制（冷却时间）、每日使用次数上限。
- **🌐 多种范围**：限制范围支持 **用户 (user)**、**频道 (channel)** 和 **全局 (global)**。
- **⚖️ 规则系统**：通过强大的规则列表，实现白名单（豁免）和黑名单（限制）功能。
- **🔍 关键词匹配**：可针对消息中的特定关键词进行中间件限流，有效防止刷屏。

## ⚙️ 插件配置

### 1. 指令的频率限制

要限制特定指令，请前往 `Koishi 控制台 -> 插件配置 -> 指令`，找到你想要限制的指令并进行如下配置：

- **`limitScope`**: 频率限制的范围。
  - `user`：针对单个用户进行限制。
  - `channel`：针对单个频道进行限制。
  - `global`：全局共享限制。
- **`maxUsage`**: 每日最大使用次数。设置为 0 则不限制。
- **`minInterval`**: 最小调用间隔（单位：秒）。即冷却时间 (Cooldown)，设置为 0 则不限制。

**示例：**
要让 `echo` 指令每个用户每 10 秒只能使用一次，可以这样配置 `echo` 指令：

- `limitScope`: `user`
- `maxUsage`: `0`
- `minInterval`: `10`

### 2. 中间件的频率限制

中间件限制主要用于控制非指令消息的触发频率（例如，当机器人配置了复读、AI 对话等功能时）。

- **`limitMiddleware`**: `(布尔值)` 总开关，控制是否开启中间件频率限制。
- **`middlewareScope`**: `(user | channel | global)` 中间件限制的默认范围。
- **`maxMiddlewareUsage`**: `(数字)` 中间件每日最大使用次数。
- **`minMiddlewareInterval`**: `(数字)` 中间件最小调用间隔（秒）。

### 3. 通用规则配置

规则系统提供了强大的自定义能力，可以让你精细地控制哪些对象需要被限制，哪些需要被豁免。

- **`defaultAction`**: 默认行为。
  - `limit`: **黑名单模式**。默认情况下对所有用户/频道生效，规则列表用于设置“豁免”的白名单。
  - `ignore`: **白名单模式**。默认情况下对所有用户/频道不生效，规则列表用于设置需要“限制”的黑名单。

- **`rules`**: 规则列表，每一项都是一个独立的规则对象。

  - **`action`**: 匹配后的行为 (`limit`: 限制, `ignore`: 豁免)。
  - **`applyTo`**: 规则生效范围 (`middleware`: 仅中间件, `command`: 仅指令, `both`: 两者都生效)。
  - **`type`**: 匹配类型。
    - `user`: 匹配用户 ID。
    - `channel`: 匹配频道 ID。
    - `keyword`: 匹配消息内容中的关键词（仅对中间件生效）。
  - **`content`**: 要匹配的具体内容（用户 ID、频道 ID 或关键词）。

#### 规则示例 1：豁免管理员

假设你想限制所有用户，但豁免管理员（QQ号：`12345678`），可以这样配置：

1. `defaultAction`: `limit` (默认限制所有人)
2. 在 `rules` 列表中添加一条规则：
    - `action`: `ignore` (豁免)
    - `applyTo`: `both` (指令和中间件都豁免)
    - `type`: `user` (按用户ID匹配)
    - `content`: `12345678`

#### 规则示例 2：限制特定关键词刷屏

假设你想限制包含“晚安”的消息，每用户 1 小时只能发一次，可以这样配置：

1. 开启中间件限制，并设置好 `minMiddlewareInterval` (例如 `3600` 秒)。
2. `defaultAction`: `ignore` (默认不限制普通消息)
3. 在 `rules` 列表中添加一条规则：
    - `action`: `limit` (限制)
    - `applyTo`: `middleware` (仅对中间件生效)
    - `type`: `keyword` (按关键词匹配)
    - `content`: `晚安`
