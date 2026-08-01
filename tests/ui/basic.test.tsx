// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { Tabs } from '@/components/ui/Tabs'
import { useState } from 'react'

describe('Button', () => {
  it('点击触发 onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>保存</Button>)
    await user.click(screen.getByText('保存'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disabled 与 loading 均阻止点击', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { rerender } = render(
      <Button disabled onClick={onClick}>
        保存
      </Button>,
    )
    await user.click(screen.getByText('保存'))
    rerender(
      <Button loading onClick={onClick}>
        保存
      </Button>,
    )
    await user.click(screen.getByText('保存'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('variant 映射到对应样式类', () => {
    const { container } = render(<Button variant="danger">删除</Button>)
    const btn = container.querySelector('button')!
    expect(btn.className).toContain('bg-[var(--color-accent-danger)]')
  })
})

describe('Switch', () => {
  it('role=switch，点击切换 aria-checked 并回调新值', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [on, setOn] = useState(false)
      return <Switch checked={on} onChange={setOn} label="启用功能" />
    }
    render(<Harness />)
    const sw = screen.getByRole('switch')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(sw.getAttribute('aria-label')).toBe('启用功能')
    await user.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  it('disabled 时不响应', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="s" disabled />)
    await user.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Tabs', () => {
  const items = [
    { value: 'a', label: '甲' },
    { value: 'b', label: '乙' },
  ]

  it('渲染 tablist/tab，aria-selected 正确', () => {
    render(<Tabs items={items} value="a" onChange={() => {}} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
  })

  it('点击触发 onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Tabs items={items} value="a" onChange={onChange} />)
    await user.click(screen.getByText('乙'))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('方向键循环选择并移动焦点（roving tabindex）', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [value, setValue] = useState('a')
      return <Tabs items={items} value={value} onChange={setValue} />
    }
    render(<Harness />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].getAttribute('tabindex')).toBe('0')
    expect(tabs[1].getAttribute('tabindex')).toBe('-1')

    tabs[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[1].getAttribute('tabindex')).toBe('0')
    expect(tabs[0].getAttribute('tabindex')).toBe('-1')

    await user.keyboard('{ArrowRight}')
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[0])

    await user.keyboard('{ArrowLeft}')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[1])
  })

  it('Home/End 跳到首尾 tab，aria-controls 按需输出', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [value, setValue] = useState('a')
      return (
        <Tabs
          items={items}
          value={value}
          onChange={setValue}
          ariaControls={(itemValue) => `panel-${itemValue}`}
        />
      )
    }
    render(<Harness />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].getAttribute('aria-controls')).toBe('panel-a')
    expect(tabs[1].getAttribute('aria-controls')).toBe('panel-b')

    tabs[1].focus()
    await user.keyboard('{Home}')
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[0])

    await user.keyboard('{End}')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[1])
  })
})
