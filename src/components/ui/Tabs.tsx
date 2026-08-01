import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface TabItem {
  value: string
  label: ReactNode
  icon?: ReactNode
  /** 悬停提示，映射为按钮的 title */
  title?: string
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
  ariaLabel?: string
  /** 为每个分段按钮输出 data-{name}={value}，供测试/样式钩子使用 */
  itemDataAttribute?: string
  /** 返回每个 tab 关联面板的 id，用于 aria-controls（无面板时省略） */
  ariaControls?: (value: string) => string | undefined
}

/** 分段控制器（原 SettingsView 中重复 3 次的 p-1 容器模式的组件化）。 */
export function Tabs({
  items,
  value,
  onChange,
  className,
  ariaLabel,
  itemDataAttribute,
  ariaControls,
}: TabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  )

  const activateTab = (index: number) => {
    const item = items[index]
    if (!item) return
    onChange(item.value)
    tabRefs.current[index]?.focus()
  }

  // WAI-ARIA Tabs 键盘模式：左右方向键/Home/End 循环选择并移动焦点（roving tabindex）。
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) return
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return
    }
    event.preventDefault()
    let next: number
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else if (event.key === 'ArrowRight') next = (selectedIndex + 1) % items.length
    else next = (selectedIndex - 1 + items.length) % items.length
    activateTab(next)
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-1',
        className,
      )}
    >
      {items.map((item, index) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={ariaControls?.(item.value)}
            tabIndex={active ? 0 : -1}
            title={item.title}
            {...(itemDataAttribute ? { [`data-${itemDataAttribute}`]: item.value } : {})}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-all duration-[var(--motion-duration-fast)]',
              'focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]',
              active
                ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
