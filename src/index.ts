import { Argv, Command, Computed, Context, Schema, Session } from 'koishi'

// 扩展指令配置项
declare module 'koishi' {
  namespace Command {
    interface Config {
      limitScope?: Computed<'user' | 'channel' | 'global'>
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
  limitMiddleware?: boolean
  middlewareScope?: 'user' | 'channel' | 'global'
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
  limitMiddleware: Schema.boolean().default(false).description('开启中间件频率限制'),
  middlewareScope: Schema.union([
    Schema.const('user').description('用户'),
    Schema.const('channel').description('频道'),
    Schema.const('global').description('全局'),
  ]).default('user').description('频率限制范围'),
  maxMiddlewareUsage: Schema.number().default(0).description('每日次数限制'),
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
      Schema.const('keyword').description('关键词'),
    ]).default('user').description('类型'),
    content: Schema.string().required().description('内容'),
  })).role('table').description('限流规则列表'),
})

export function apply(ctx: Context, config: Config) {
  const records = new Map<string, Map<string, UsageRecord>>()

  // 扩展 command schema
  ctx.schema.extend('command', Schema.object({
    limitScope: Schema.computed(Schema.union(['user', 'channel', 'global'])).default('user').description('频率限制范围'),
    maxUsage: Schema.computed(Schema.number()).default(0).description('每日次数限制'),
    minInterval: Schema.computed(Schema.number()).default(0).description('连续调用间隔（秒）'),
  }), 800)

  // 核心检查函数
  function check(options: {
    session: Session,
    scope: 'user' | 'channel' | 'global',
    name: string,
    minInterval: number,
    maxUsage: number
  }): string | undefined {
    const { session, scope, name, minInterval, maxUsage } = options
    if (!minInterval && !maxUsage) return

    const recordId = scope === 'user' ? `user:${session.userId}`
      : scope === 'channel' ? `channel:${session.channelId}`
      : 'global'

    if (!recordId || (scope !== 'global' && !recordId.split(':')[1])) return

    const now = Date.now()
    let commandRecords = records.get(recordId)
    if (!commandRecords) records.set(recordId, commandRecords = new Map())

    let record = commandRecords.get(name)
    if (!record) commandRecords.set(name, record = {})

    if (minInterval > 0 && record.cooldownExpiresAt && now < record.cooldownExpiresAt) {
      return ''
    }

    if (maxUsage > 0) {
      if (!record.dailyResetAt || now > record.dailyResetAt) {
        record.dailyUsesLeft = maxUsage
        const tomorrow = new Date()
        tomorrow.setHours(24, 0, 0, 0)
        record.dailyResetAt = tomorrow.getTime()
      }
      if (record.dailyUsesLeft <= 0) {
        return ''
      }
    }

    if (minInterval > 0) record.cooldownExpiresAt = now + minInterval * 1000
    if (maxUsage > 0) record.dailyUsesLeft--
  }

  // 检查会话是否匹配规则的函数
  function shouldApplyLimit(session: Session, context: 'command' | 'middleware'): boolean {
    const relevantRules = config.rules?.filter(rule => rule.applyTo === context || rule.applyTo === 'both') || []

    const isMatch = (rule: FilterRule): boolean => {
      if (rule.type === 'user' && rule.content === session.userId) return true
      if (rule.type === 'channel' && rule.content === session.channelId) return true
      if (context === 'middleware' && rule.type === 'keyword' && session.content?.includes(rule.content)) return true
      return false
    }

    const matchedRule = relevantRules.find(isMatch)

    if (matchedRule) {
      return matchedRule.action === 'limit' // 如果匹配到规则，根据规则的 action 决定
    }

    return config.defaultAction === 'limit' // 如果未匹配到任何规则，根据默认行为决定
  }

  /**
   * 统一的限流处理函数
   * @param session 当前会话
   * @param context 'command' 或 'middleware'
   * @param command (可选) 当前指令对象
   * @returns 如果需要拦截，则返回空字符串；否则返回 undefined
   */
  function rateLimit(session: Session, context: 'command' | 'middleware', command?: Command): string | undefined {
    if (!shouldApplyLimit(session, context)) return

    // 根据上下文准备 check 函数所需的参数
    const options = context === 'command' && command
      ? {
        session,
        scope: session.resolve(command.config.limitScope),
        name: command.name.replace(/\./g, ':'),
        minInterval: session.resolve(command.config.minInterval),
        maxUsage: session.resolve(command.config.maxUsage),
      }
      : {
        session,
        scope: config.middlewareScope,
        name: 'middleware',
        minInterval: config.minMiddlewareInterval,
        maxUsage: config.maxMiddlewareUsage,
      }

    return check(options)
  }

  // 拦截指令执行
  ctx.before('command/execute', ({ session, command }: Argv) => {
    return rateLimit(session, 'command', command)
  })

  // 拦截中间件触发
  ctx.middleware((session, next) => {
    if (!config.limitMiddleware || session.argv) return next()

    const result = rateLimit(session, 'middleware')
    return result === undefined ? next() : result
  }, true)
}
