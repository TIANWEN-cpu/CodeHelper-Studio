import { dialog, BrowserWindow } from 'electron'
import { cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { homedir, tmpdir } from 'os'
import path from 'path'
import { promisify } from 'util'
import { registerIpcHandler, rateLimitMiddleware } from '../utils/middleware'

const execFileAsync = promisify(execFile)
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const maxAssetBytes = 16 * 1024 * 1024

interface CodexPetManifest {
  id?: string
  pet_id?: string
  name?: string
  displayName?: string
  display_name?: string
  description?: string
  spritesheetPath?: string
  atlas?: {
    columns?: number
    rows?: number
    cell_width?: number
    cell_height?: number
    width?: number
    height?: number
  }
  rows?: Array<{ state: string; row: number; frames: number; purpose?: string }>
}

interface CodexPetDefinition {
  id: string
  displayName: string
  description: string
  source: 'local' | 'remote'
  manifest: CodexPetManifest
  spritesheetUrl: string
  installPath: string
}

interface PetInstallResult {
  ok: boolean
  error?: string
  pet?: CodexPetDefinition
}

function codexHome(): string {
  return process.env.CODEX_HOME || path.join(homedir(), '.codex')
}

function petsRoot(): string {
  return path.join(codexHome(), 'pets')
}

function safePetId(value: unknown, fallback = 'pet'): string {
  const id = String(value || fallback).trim()
  if (!id || id === '.' || id === '..' || /[\\/]/.test(id)) {
    throw new Error('pet.json 中的 id 无效')
  }
  return id.slice(0, 80)
}

function normalizeSlug(value: unknown): string {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
  if (!slugPattern.test(slug)) throw new Error('桌宠 slug 必须类似 firefly 或 happy-dog')
  return slug
}

function manifestId(manifest: CodexPetManifest, fallback?: string): string {
  return safePetId(manifest.id || manifest.pet_id || manifest.name || fallback || 'pet')
}

function displayName(manifest: CodexPetManifest, fallback: string): string {
  return String(manifest.displayName || manifest.display_name || manifest.name || fallback)
}

async function readJsonFile(filePath: string): Promise<CodexPetManifest> {
  const raw = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as CodexPetManifest
  if (!parsed || typeof parsed !== 'object') throw new Error('pet.json 格式无效')
  return parsed
}

async function fileDataUrl(filePath: string): Promise<string> {
  const info = await stat(filePath)
  if (info.size > maxAssetBytes) throw new Error('spritesheet.webp 过大')
  const bytes = await readFile(filePath)
  return `data:image/webp;base64,${bytes.toString('base64')}`
}

function spritesheetPathFor(dir: string, manifest: CodexPetManifest): string {
  const relative = String(manifest.spritesheetPath || 'spritesheet.webp')
  if (path.isAbsolute(relative) || relative.includes('..')) {
    throw new Error('spritesheetPath 无效')
  }
  return path.join(dir, relative)
}

async function petFromDirectory(
  dir: string,
  source: 'local' | 'remote' = 'local',
): Promise<CodexPetDefinition> {
  const manifestPath = path.join(dir, 'pet.json')
  const manifest = await readJsonFile(manifestPath)
  const id = manifestId(manifest, path.basename(dir))
  const spritesheet = spritesheetPathFor(dir, manifest)
  if (!existsSync(spritesheet)) throw new Error('缺少 spritesheet.webp')
  return {
    id,
    displayName: displayName(manifest, id),
    description: manifest.description || '',
    source,
    manifest,
    spritesheetUrl: await fileDataUrl(spritesheet),
    installPath: dir,
  }
}

async function listPets(): Promise<CodexPetDefinition[]> {
  const root = petsRoot()
  if (!existsSync(root)) return []
  const entries = await readdir(root, { withFileTypes: true })
  const pets = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return await petFromDirectory(path.join(root, entry.name), 'local')
        } catch {
          return null
        }
      }),
  )
  return pets.filter((pet): pet is CodexPetDefinition => Boolean(pet))
}

async function downloadBytes(url: string, label: string): Promise<Uint8Array> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error(`${label} 必须使用 https`)
  const response = await fetch(parsed, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`下载 ${label} 失败: ${response.status}`)
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > maxAssetBytes) throw new Error(`${label} 过大`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > maxAssetBytes) throw new Error(`${label} 过大`)
  return bytes
}

async function fetchPublicAssetLinks(
  slug: string,
): Promise<{ manifestUrl: string; spritesheetUrl: string }> {
  const pageUrl = `https://codex-pet.org/pets/${slug}/`
  const response = await fetch(pageUrl, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`查询 codex-pet.org 失败: ${response.status}`)
  const html = await response.text()
  const urls = Array.from(
    html.matchAll(/https:\/\/assets\.codex-pet\.org\/[^"'<>\\]+\/(?:pet\.json|spritesheet\.webp)/g),
    (match) => match[0],
  )
  const preferred = urls.filter((url) => url.includes(`/${slug}/`))
  const candidates = preferred.length ? preferred : urls
  const spritesheetUrl = candidates.find((url) => url.endsWith('/spritesheet.webp'))
  const manifestUrl =
    candidates.find((url) => url.endsWith('/pet.json')) ||
    spritesheetUrl?.replace(/spritesheet\.webp$/i, 'pet.json')
  if (!manifestUrl || !spritesheetUrl) throw new Error(`没有找到 ${slug} 的宠物资源`)
  return { manifestUrl, spritesheetUrl }
}

async function installPetFiles(
  manifestBytes: Uint8Array,
  spritesheetBytes: Uint8Array,
): Promise<CodexPetDefinition> {
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as CodexPetManifest
  const id = manifestId(manifest)
  const normalizedManifest: CodexPetManifest = {
    ...manifest,
    id,
    displayName: displayName(manifest, id),
    spritesheetPath: 'spritesheet.webp',
  }
  const installPath = path.join(petsRoot(), id)
  await mkdir(installPath, { recursive: true })
  await writeFile(path.join(installPath, 'pet.json'), JSON.stringify(normalizedManifest, null, 2))
  await writeFile(path.join(installPath, 'spritesheet.webp'), spritesheetBytes)
  return petFromDirectory(installPath, 'remote')
}

async function installSlug(slugValue: unknown): Promise<PetInstallResult> {
  try {
    const slug = normalizeSlug(slugValue)
    const links = await fetchPublicAssetLinks(slug)
    const [manifestBytes, spritesheetBytes] = await Promise.all([
      downloadBytes(links.manifestUrl, 'pet.json'),
      downloadBytes(links.spritesheetUrl, 'spritesheet.webp'),
    ])
    return { ok: true, pet: await installPetFiles(manifestBytes, spritesheetBytes) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function importDirectory(directory: string): Promise<PetInstallResult> {
  try {
    const source = await petFromDirectory(directory, 'local')
    const installPath = path.join(petsRoot(), source.id)
    await mkdir(installPath, { recursive: true })
    await cp(path.join(directory, 'pet.json'), path.join(installPath, 'pet.json'))
    await cp(
      spritesheetPathFor(directory, source.manifest),
      path.join(installPath, 'spritesheet.webp'),
    )
    const manifest = await readJsonFile(path.join(installPath, 'pet.json'))
    manifest.id = source.id
    manifest.displayName = source.displayName
    manifest.spritesheetPath = 'spritesheet.webp'
    await writeFile(path.join(installPath, 'pet.json'), JSON.stringify(manifest, null, 2))
    return { ok: true, pet: await petFromDirectory(installPath, 'local') }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function extractZip(zipPath: string): Promise<string> {
  const target = await mkdtemp(path.join(tmpdir(), 'codehelper-pet-'))
  if (process.platform === 'win32') {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
      zipPath,
      target,
    ])
  } else {
    await execFileAsync('unzip', ['-q', zipPath, '-d', target])
  }
  return target
}

async function findImportRoot(startDir: string): Promise<string> {
  if (existsSync(path.join(startDir, 'pet.json'))) return startDir
  const entries = await readdir(startDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(startDir, entry.name)
    if (existsSync(path.join(candidate, 'pet.json'))) return candidate
  }
  throw new Error('导入包中没有找到 pet.json')
}

async function importFile(): Promise<PetInstallResult> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(win, {
    title: '导入 Codex Pet',
    properties: ['openFile'],
    filters: [
      { name: 'Codex Pet', extensions: ['zip', 'json', 'webp'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePaths[0]) return { ok: false, error: '已取消导入' }
  const filePath = result.filePaths[0]
  if (filePath.toLowerCase().endsWith('.zip')) {
    const extracted = await extractZip(filePath)
    return importDirectory(await findImportRoot(extracted))
  }
  return importDirectory(path.dirname(filePath))
}

async function importDirectoryFromDialog(): Promise<PetInstallResult> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(win, {
    title: '选择 Codex Pet 文件夹',
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return { ok: false, error: '已取消导入' }
  return importDirectory(result.filePaths[0])
}

export function registerPetsIPC(): void {
  registerIpcHandler('pets-list', () => listPets())
  registerIpcHandler('pets-install-slug', (_event, slug: unknown) => installSlug(slug), [
    rateLimitMiddleware({ maxCalls: 5, windowMs: 60_000 }),
  ])
  registerIpcHandler('pets-import-file', () => importFile(), [
    rateLimitMiddleware({ maxCalls: 10, windowMs: 60_000 }),
  ])
  registerIpcHandler('pets-import-directory', () => importDirectoryFromDialog(), [
    rateLimitMiddleware({ maxCalls: 10, windowMs: 60_000 }),
  ])
}
