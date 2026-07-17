import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const settings = vi.hoisted(() => ({
  values: new Map<string, string>(),
  getSetting: vi.fn<(key: string) => Promise<string | null>>(),
  setSetting: vi.fn<(key: string, value: string) => Promise<void>>(),
}))

vi.mock('../src/services/settingsService', () => ({
  getSetting: (key: string) => settings.getSetting(key),
  setSetting: (key: string, value: string) => settings.setSetting(key, value),
}))

const { AI_PET_SIZE_MAX, DEFAULT_AI_PET_SIZE, flushAppearanceWrites, loadAppearance } =
  await import('../src/lib/appearance')
const { useAppStore } = await import('../src/store')

beforeEach(async () => {
  await flushAppearanceWrites()
  settings.values.clear()
  settings.getSetting.mockReset()
  settings.setSetting.mockReset()
  settings.getSetting.mockImplementation(async (key) => settings.values.get(key) ?? null)
  settings.setSetting.mockImplementation(async (key, value) => {
    settings.values.set(key, value)
  })
  useAppStore.setState({ aiPetSize: DEFAULT_AI_PET_SIZE })
  vi.stubGlobal('document', {
    documentElement: { setAttribute: vi.fn() },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI pet size appearance setting', () => {
  it('loads and clamps the persisted database value', async () => {
    settings.values.set('ai_pet_size', '999')
    settings.values.set('appearance_light_theme_alignment_v1', 'done')

    await expect(loadAppearance()).resolves.toMatchObject({ aiPetSize: AI_PET_SIZE_MAX })
    expect(settings.getSetting).toHaveBeenCalledWith('ai_pet_size')
  })

  it('updates immediately and persists the normalized percentage', async () => {
    useAppStore.getState().setAIPetSize(999)

    expect(useAppStore.getState().aiPetSize).toBe(AI_PET_SIZE_MAX)
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith(
      'data-ai-pet-size',
      String(AI_PET_SIZE_MAX),
    )

    await flushAppearanceWrites()
    expect(settings.setSetting).toHaveBeenCalledWith('ai_pet_size', String(AI_PET_SIZE_MAX))
  })

  it('exposes the bounded percentage slider and a live pet preview in settings', () => {
    const source = readFileSync('src/views/SettingsView.tsx', 'utf8')

    expect(source).toContain('id="ai-pet-size"')
    expect(source).toContain('min={AI_PET_SIZE_MIN}')
    expect(source).toContain('max={AI_PET_SIZE_MAX}')
    expect(source).toContain('setAIPetSize(Number(event.target.value))')
    expect(source).toContain('`${selectedPet.displayName} 大小预览`')
    expect(source).toContain('ariaLabel="AI 桌宠"')
    expect(source).toContain('var(--color-border-subtle) 100%')
  })

  it('keeps pet menus and controls at an accessible size while the pet scales', () => {
    const petSource = readFileSync('src/components/AIPet.tsx', 'utf8')
    const styles = readFileSync('src/index.css', 'utf8')

    expect(petSource).toContain("'--ai-pet-inverse-scale': String(100 / aiPetSize)")
    expect(styles).toContain('transform: translateX(0) scale(var(--ai-pet-inverse-scale, 1));')
    expect(styles).toContain(
      'transform: translate(-50%, -100%) scale(var(--ai-pet-inverse-scale, 1));',
    )
    expect(styles).toContain('transform: scale(var(--ai-pet-inverse-scale, 1));')
  })

  it('flushes the queued size write before the application closes', () => {
    const appSource = readFileSync('src/App.tsx', 'utf8')

    expect(appSource).toContain("registerAppCloseFlushHandler('appearance-settings'")
    expect(appSource).toContain('await flushAppearanceWrites()')
    expect(appSource).toContain('unregisterAppearance()')
  })
})
