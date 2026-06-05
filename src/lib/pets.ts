import fireflySpritesheet from '@/assets/pets/firefly/spritesheet.webp'
import { invoke } from '@/services/ipc'

export const DEFAULT_PET_ID = 'firefly'
export const PET_SOURCE_STORAGE_KEY = 'codehelper.aiPetSource'

export type CodexPetSource = 'built-in' | 'local' | 'remote'

export interface CodexPetRow {
  state: string
  row: number
  frames: number
  purpose?: string
}

export interface CodexPetManifest {
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
  rows?: CodexPetRow[]
}

export interface CodexPetDefinition {
  id: string
  displayName: string
  description: string
  source: CodexPetSource
  manifest: CodexPetManifest
  spritesheetUrl: string
  installPath?: string
}

export interface PetInstallResult {
  ok: boolean
  error?: string
  pet?: CodexPetDefinition
}

export const FIREFLY_MANIFEST: CodexPetManifest = {
  id: 'firefly',
  pet_id: 'firefly',
  name: 'firefly',
  displayName: '流萤',
  display_name: '流萤',
  description:
    'A chibi pet of Firefly (流萤), with silver-white short hair, bright green eyes, and a white-dark combat outfit with mechanical accents.',
  spritesheetPath: 'spritesheet.webp',
  atlas: {
    columns: 8,
    rows: 9,
    cell_width: 192,
    cell_height: 208,
    width: 1536,
    height: 1872,
  },
  rows: [
    { state: 'idle', row: 0, frames: 6, purpose: 'calm resting, breathing, and blinking loop' },
    { state: 'running-right', row: 1, frames: 8, purpose: 'rightward drag movement loop' },
    { state: 'running-left', row: 2, frames: 8, purpose: 'leftward drag movement loop' },
    { state: 'waving', row: 3, frames: 4, purpose: 'greeting or attention gesture' },
    { state: 'jumping', row: 4, frames: 5, purpose: 'hover or playful jump' },
    { state: 'failed', row: 5, frames: 8, purpose: 'blocked, failed, or cancelled reaction' },
    { state: 'waiting', row: 6, frames: 6, purpose: 'waiting for approval, help, or user input' },
    { state: 'running', row: 7, frames: 6, purpose: 'active task work or processing' },
    { state: 'review', row: 8, frames: 6, purpose: 'ready or completed output review' },
  ],
}

function petIdFromManifest(manifest: CodexPetManifest, fallback = DEFAULT_PET_ID): string {
  return String(manifest.id || manifest.pet_id || manifest.name || fallback)
}

function petDisplayName(manifest: CodexPetManifest, fallback: string): string {
  return String(manifest.displayName || manifest.display_name || manifest.name || fallback)
}

export const BUILT_IN_FIREFLY_PET: CodexPetDefinition = {
  id: DEFAULT_PET_ID,
  displayName: petDisplayName(FIREFLY_MANIFEST, '流萤'),
  description:
    FIREFLY_MANIFEST.description ||
    'A chibi pet of Firefly with silver-white short hair, green eyes, and a white-dark combat outfit.',
  source: 'built-in',
  manifest: FIREFLY_MANIFEST,
  spritesheetUrl: fireflySpritesheet,
}

function normalizePet(
  raw: Partial<CodexPetDefinition> | null | undefined,
): CodexPetDefinition | null {
  if (!raw?.manifest || !raw.spritesheetUrl) return null
  const id = raw.id || petIdFromManifest(raw.manifest)
  return {
    id,
    displayName: raw.displayName || petDisplayName(raw.manifest, id),
    description: raw.description || raw.manifest.description || '',
    source: raw.source || 'local',
    manifest: raw.manifest,
    spritesheetUrl: raw.spritesheetUrl,
    installPath: raw.installPath,
  }
}

export function getPetAtlas(manifest: CodexPetManifest) {
  return {
    columns: manifest.atlas?.columns || 8,
    rows: manifest.atlas?.rows || 9,
    cellWidth: manifest.atlas?.cell_width || 192,
    cellHeight: manifest.atlas?.cell_height || 208,
  }
}

export function getPetState(manifest: CodexPetManifest, preferred = 'idle'): CodexPetRow {
  const rows = manifest.rows || []
  return (
    rows.find((row) => row.state === preferred) ||
    rows.find((row) => row.state === 'idle') || { state: 'idle', row: 0, frames: 6 }
  )
}

export async function listInstalledPets(): Promise<CodexPetDefinition[]> {
  try {
    const pets = await invoke<CodexPetDefinition[]>('pets-list')
    const normalized = pets
      .map(normalizePet)
      .filter((pet): pet is CodexPetDefinition => Boolean(pet))
    const byId = new Map<string, CodexPetDefinition>()
    ;[BUILT_IN_FIREFLY_PET, ...normalized].forEach((pet) => byId.set(pet.id, pet))
    return Array.from(byId.values())
  } catch {
    return [BUILT_IN_FIREFLY_PET]
  }
}

export async function installPetBySlug(slug: string): Promise<PetInstallResult> {
  return invoke<PetInstallResult>('pets-install-slug', slug)
}

export async function importPetFromFile(): Promise<PetInstallResult> {
  return invoke<PetInstallResult>('pets-import-file')
}

export async function selectPetDirectory(): Promise<PetInstallResult> {
  return invoke<PetInstallResult>('pets-import-directory')
}

export function readStoredPetSource(): string {
  if (typeof window === 'undefined') return DEFAULT_PET_ID
  try {
    return window.localStorage.getItem(PET_SOURCE_STORAGE_KEY) || DEFAULT_PET_ID
  } catch {
    return DEFAULT_PET_ID
  }
}

export function persistPetSource(id: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PET_SOURCE_STORAGE_KEY, id)
  } catch {
    /* Pet selection is a preference; ignore storage failures. */
  }
}
