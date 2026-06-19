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
