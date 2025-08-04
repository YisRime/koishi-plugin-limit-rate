import { Argv, Computed, Context, Schema } from 'koishi'

// 扩展指令配置项
declare module 'koishi' {
  namespace Command {
    interface Config {
      maxUsage?: Computed<number>
      minInterval?: Computed<number>
    }
  }
}

// 指令使用记录的接口
interface CommandRecord {
  cooldownExpiresAt?: number // 冷却到期时间戳
  dailyUsesLeft?: number     // 当日剩余次数
  dailyResetAt?: number      // 次数重置时间戳
}

export const name = 'rate-limit-silent'
export interface Config {}
export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context) {
  // Map<用户ID, Map<指令名, 使用记录>>
  const userRecords = new Map<string, Map<string, CommandRecord>>()

  // 扩展指令配置项
  ctx.schema.extend('command', Schema.object({
    maxUsage: Schema.computed(Schema.number()).default(0).description('每天的调用次数上限'),
    minInterval: Schema.computed(Schema.number()).default(0).description('连续调用的最小间隔（秒）'),
  }), 800)

  // 在指令执行前进行拦截
  ctx.before('command/execute', (argv: Argv) => {
    const { session, command } = argv

    // 如果指令没有任何频率限制配置，则立即退出
    const minInterval = session.resolve(command.config.minInterval)
    const maxUsage = session.resolve(command.config.maxUsage)
    if (!minInterval && !maxUsage) return

    const userId = session?.userId
    if (!userId) return

    const now = Date.now()
    const commandName = command.name.replace(/\./g, ':')

    // 获取或创建记录
    let userCommands = userRecords.get(userId)
    if (!userCommands) {
      userCommands = new Map<string, CommandRecord>()
      userRecords.set(userId, userCommands)
    }

    let record = userCommands.get(commandName)
    if (!record) {
      record = {}
      userCommands.set(commandName, record)
    }

    // 冷却时间检查
    if (minInterval > 0) {
      if (record.cooldownExpiresAt && now < record.cooldownExpiresAt) {
        return ''
      }
    }

    // 每日用量检查
    if (maxUsage > 0) {
      if (!record.dailyResetAt || now > record.dailyResetAt) {
        record.dailyUsesLeft = maxUsage
        const tomorrow = new Date()
        tomorrow.setHours(24, 0, 0, 0)
        record.dailyResetAt = tomorrow.getTime()
      }

      if (record.dailyUsesLeft! <= 0) {
        return ''
      }
    }

    if (minInterval > 0) {
      record.cooldownExpiresAt = now + (minInterval * 1000)
    }

    if (maxUsage > 0) {
      record.dailyUsesLeft!--
    }
  })
}
