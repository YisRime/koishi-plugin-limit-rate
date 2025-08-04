import { Argv, Command, Computed, Context, Schema, Session } from 'koishi'

// 扩展指令配置项
declare module 'koishi' {
  namespace Command {
    interface Config {
      maxUsage?: Computed<number>
      minInterval?: Computed<number>
    }
  }
}

// 使用记录的接口
interface UsageRecord {
  cooldownExpiresAt?: number
  dailyUsesLeft?: number
  dailyResetAt?: number
}

// 规则接口
interface FilterRule {
  applyTo: 'middleware' | 'command' | 'both'
  type: 'user' | 'channel' | 'keyword'
  content: string
  action: 'limit' | 'ignore'
}

// 插件主配置项
export interface Config {
  scope?: 'user' | 'channel' | 'global'
  sendHint?: boolean
  limitMiddleware?: boolean
  maxMiddlewareUsage?: number
  minMiddlewareInterval?: number
  defaultAction?: 'limit' | 'ignore'
  rules?: FilterRule[]
}

// 插件说明和支持信息
export const usage = `
<div style="border-radius: 10px; border: 1px solid #ddd; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
  <h2 style="margin-top: 0; color: #4a6ee0;">📌 插件说明</h2>
  <p>📖 <strong>使用文档</strong>：请点击左上角的 <strong>插件主页</strong> 查看插件使用文档</p>
  <p>🔍 <strong>更多插件</strong>：可访问 <a href="https://github.com/YisRime" style="color:#4a6ee0;text-decoration:none;">苡淞的 GitHub</a> 查看本人的所有插件</p>
</div>
<div style="border-radius: 10px; border: 1px solid #ddd; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
  <h2 style="margin-top: 0; color: #e0574a;">❤️ 支持与反馈</h2>
  <p>🌟 喜欢这个插件？请在 <a href="https://github.com/YisRime" style="color:#e0574a;text-decoration:none;">GitHub</a> 上给我一个 Star！</p>
  <p>🐛 遇到问题？请通过 <strong>Issues</strong> 提交反馈，或加入 QQ 群 <a href="https://qm.qq.com/q/PdLMx9Jowq" style="color:#e0574a;text-decoration:none;"><strong>855571375</strong></a> 进行交流</p>
</div>
`

export const name = 'rate-limit'

// 配置项 Schema
export const Config: Schema<Config> = Schema.object({
  scope: Schema.union([
    Schema.const('user').description('用户'),
    Schema.const('channel').description('频道'),
    Schema.const('global').description('全局'),
  ]).default('user').description('频率限制范围'),
  sendHint: Schema.boolean().default(true).description('发送提示信息'),
  limitMiddleware: Schema.boolean().default(false).description('限制中间件频率'),
  maxMiddlewareUsage: Schema.number().default(0).description('每日调用次数'),
  minMiddlewareInterval: Schema.number().default(0).description('连续调用间隔（秒）'),

  defaultAction: Schema.union([
      Schema.const('limit').description('限制'),
      Schema.const('ignore').description('豁免'),
  ]).default('limit').description('默认行为'),
  rules: Schema.array(Schema.object({
    action: Schema.union([
      Schema.const('limit').description('限制'),
      Schema.const('ignore').description('豁免'),
    ]).default('ignore').description('匹配行为'),
    applyTo: Schema.union([
      Schema.const('middleware').description('中间件'),
      Schema.const('command').description('指令'),
      Schema.const('both').description('两者'),
    ]).default('both').description('生效范围'),
    type: Schema.union([
      Schema.const('user').description('用户ID'),
      Schema.const('channel').description('频道ID'),
      Schema.const('keyword').description('关键词（仅限中间件）'),
    ]).default('user').description('匹配类型'),
    content: Schema.string().required().description('匹配内容'),
  })).role('table').description('规则列表'),
})

export function apply(ctx: Context, config: Config) {
  const commandRecords = new Map<string, Map<string, UsageRecord>>()
  const middlewareRecords = new Map<string, Map<string, UsageRecord>>()

  const commandRules = config.rules?.filter(rule => rule.applyTo === 'command' || rule.applyTo === 'both') || []
  const middlewareRules = config.rules?.filter(rule => rule.applyTo === 'middleware' || rule.applyTo === 'both') || []

  ctx.schema.extend('command', Schema.object({
    maxUsage: Schema.computed(Schema.number()).default(0).description('每日次数限制'),
    minInterval: Schema.computed(Schema.number()).default(0).description('连续调用间隔'),
  }), 800)

  function shouldApplyLimit(session: Session, rules: FilterRule[], context: 'command' | 'middleware'): boolean {
    const isMatch = (rule: FilterRule): boolean => {
      switch (rule.type) {
        case 'user': return rule.content === session.userId
        case 'channel': return rule.content === session.channelId
        case 'keyword': return context === 'middleware' && session.content?.includes(rule.content)
        default: return false
      }
    }
    const matchedRule = rules.find(isMatch)
    return matchedRule ? matchedRule.action === 'limit' : config.defaultAction === 'limit'
  }

  /**
   * 核心检查函数，处理冷却和使用次数
   * @returns 若被限流则返回提示字符串，否则返回 undefined
   */
  function checkRateLimit(
    records: Map<string, Map<string, UsageRecord>>,
    session: Session,
    scope: 'user' | 'channel' | 'global',
    name: string,
    minInterval: number,
    maxUsage: number
  ): string | undefined {
    if (!minInterval && !maxUsage) return

    const recordId = scope === 'global' ? 'global' : `${scope}:${scope === 'user' ? session.userId : session.channelId}`
    if (scope !== 'global' && !recordId.split(':')[1]) return

    const now = Date.now()
    let userOrChannelRecords = records.get(recordId)
    if (!userOrChannelRecords) {
      userOrChannelRecords = new Map()
      records.set(recordId, userOrChannelRecords)
    }

    let record = userOrChannelRecords.get(name)
    if (!record) {
      record = {}
      userOrChannelRecords.set(name, record)
    }

    if (minInterval > 0 && record.cooldownExpiresAt && now < record.cooldownExpiresAt) {
      const remaining = Math.ceil((record.cooldownExpiresAt - now) / 1000)
      return `操作过于频繁，请在 ${remaining} 秒后重试`
    }

    if (maxUsage > 0) {
      if (!record.dailyResetAt || now > record.dailyResetAt) {
        record.dailyUsesLeft = maxUsage
        const tomorrow = new Date()
        tomorrow.setHours(24, 0, 0, 0)
        record.dailyResetAt = tomorrow.getTime()
      }
      if (record.dailyUsesLeft <= 0) {
        return `今日使用次数已达上限`
      }
    }

    if (minInterval > 0) record.cooldownExpiresAt = now + minInterval * 1000
    if (maxUsage > 0) record.dailyUsesLeft--
  }

  ctx.before('command/execute', ({ session, command }: Argv) => {
    if (!shouldApplyLimit(session, commandRules, 'command')) return

    const minInterval = session.resolve(command.config.minInterval)
    const maxUsage = session.resolve(command.config.maxUsage)
    const name = command.name.replace(/\./g, ':')

    const result = checkRateLimit(commandRecords, session, config.scope, name, minInterval, maxUsage)

    if (result) {
      return config.sendHint ? result : ''
    }
  })

  ctx.middleware((session, next) => {
    if (!config.limitMiddleware || session.argv) return next()
    if (!shouldApplyLimit(session, middlewareRules, 'middleware')) return next()

    const result = checkRateLimit(middlewareRecords, session, config.scope, 'middleware', config.minMiddlewareInterval, config.maxMiddlewareUsage)

    if (result === undefined) {
      return next()
    } else {
      return config.sendHint ? result : ''
    }
  }, true)
}
