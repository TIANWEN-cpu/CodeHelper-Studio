// petReactions.ts
// 桌宠对「学习行为」的反应映射（纯函数，便于单测）。
// 行为事件来自 analyticsService.track；只对值得庆祝的里程碑给出反应，
// 高频事件（运行代码、发消息）保持安静，避免桌宠抖动刷屏。

export interface PetReaction {
  /** 传给精灵图的状态行（见 BUILT_IN_FIREFLY_PET 的 states）。 */
  state: string
  /** 状态动画持续时间（毫秒）。 */
  duration: number
  /** 可选气泡文案；省略则只播动画不弹气泡。 */
  message?: string
}

const REACTIONS: Record<string, PetReaction> = {
  problem_solved: { state: 'jumping', duration: 1600, message: '解题成功，漂亮！' },
  lesson_completed: { state: 'jumping', duration: 1600, message: '又学完一课！' },
}

/** 取某个行为对应的桌宠反应；无映射返回 null（保持安静）。 */
export function getPetReaction(activityType: string): PetReaction | null {
  return REACTIONS[activityType] ?? null
}

/** 空闲时随机播放的小动作（无气泡），让桌宠在静置时也有生气。 */
export const IDLE_ANIMATIONS: PetReaction[] = [
  { state: 'waving', duration: 760 },
  { state: 'jumping', duration: 900 },
]

/**
 * 按 [0,1) 的随机种子挑一个空闲小动作（纯函数，便于确定性测试）。
 * 越界种子会被夹到合法区间。
 */
export function pickIdleAnimation(seed: number): PetReaction {
  const clamped = Number.isFinite(seed) ? Math.min(0.999999, Math.max(0, seed)) : 0
  const index = Math.floor(clamped * IDLE_ANIMATIONS.length)
  return IDLE_ANIMATIONS[index] ?? IDLE_ANIMATIONS[0]
}
