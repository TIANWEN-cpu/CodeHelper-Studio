// @vitest-environment jsdom
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from '@/components/ui/Dialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

describe('Dialog', () => {
  it('open 时渲染 role=dialog 且 aria-modal，关闭时不渲染', () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => {}} title="标题">
        内容
      </Dialog>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()

    rerender(
      <Dialog open={true} onClose={() => {}} title="标题">
        内容
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('标题')).toBeTruthy()
    expect(screen.getByText('内容')).toBeTruthy()
  })

  it('Escape 触发 onClose，closeOnEscape=false 时不触发', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(
      <Dialog open={true} onClose={onClose} title="t">
        <button>inside</button>
      </Dialog>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    const onClose2 = vi.fn()
    rerender(
      <Dialog open={true} onClose={onClose2} closeOnEscape={false} title="t">
        <button>inside</button>
      </Dialog>,
    )
    await user.keyboard('{Escape}')
    expect(onClose2).not.toHaveBeenCalled()
  })

  it('点击遮罩关闭，点击面板内部不关闭', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Dialog open={true} onClose={onClose} title="t">
        <button>inside</button>
      </Dialog>,
    )
    await user.click(screen.getByText('inside'))
    expect(onClose).not.toHaveBeenCalled()

    const overlay = screen.getByRole('dialog').parentElement!
    await user.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Tab 在面板内循环聚焦', async () => {
    const user = userEvent.setup()
    render(
      <Dialog open={true} onClose={() => {}} title="t">
        <button>first</button>
        <button>last</button>
      </Dialog>,
    )
    const closeBtn = screen.getByLabelText('关闭')
    // 打开时聚焦第一个可聚焦元素（关闭按钮）
    expect(document.activeElement).toBe(closeBtn)

    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('first'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('last'))
    // 到最后一个后再 Tab 回到第一个
    await user.tab()
    expect(document.activeElement).toBe(closeBtn)
    // Shift+Tab 反向循环
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByText('last'))
  })

  it('关闭后焦点还原到打开前的元素', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>open</button>
          <Dialog open={open} onClose={() => setOpen(false)} title="t" />
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByText('open')
    await user.click(opener)
    expect(screen.getByRole('dialog')).toBeTruthy()
    await user.keyboard('{Escape}')
    // AnimatePresence 退出动画结束后才卸载，异步等待
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('打开时锁定页面滚动，关闭后恢复', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>open</button>
          <Dialog open={open} onClose={() => setOpen(false)} title="t" />
        </>
      )
    }
    render(<Harness />)
    expect(document.body.style.overflow).toBe('')
    await user.click(screen.getByText('open'))
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.style.overflow).toBe('')
  })

  it('打开时把对话框之外的 body 子树标记为 aria-hidden，关闭后还原', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>open</button>
          <Dialog open={open} onClose={() => setOpen(false)} title="t">
            <button>inside</button>
          </Dialog>
        </>
      )
    }
    render(<Harness />)
    const backgroundRoot = screen.getByText('open').parentElement!
    expect(backgroundRoot.getAttribute('aria-hidden')).toBeNull()
    await user.click(screen.getByText('open'))
    expect(backgroundRoot.getAttribute('aria-hidden')).toBe('true')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(backgroundRoot.getAttribute('aria-hidden')).toBeNull()
  })
})

describe('ConfirmDialog', () => {
  it('确认与取消分别触发对应回调', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        title="删除文件"
        description="不可恢复"
        danger
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    await user.click(screen.getByText('确认'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()

    await user.click(screen.getByText('取消'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('默认焦点不落在确认按钮（危险操作防误触）', () => {
    render(<ConfirmDialog open={true} title="t" onConfirm={() => {}} onCancel={() => {}} />)
    // 首个可聚焦元素是右上角关闭按钮，确认按钮需要用户主动移焦
    expect(document.activeElement).toBe(screen.getByLabelText('关闭'))
    expect(document.activeElement).not.toBe(screen.getByText('确认'))
  })
})
