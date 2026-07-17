import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}))

import { allowedEventChannels, allowedInvokeChannels } from '../electron/preload'
import {
  IPC_CHANNEL_CONTRACTS,
  type CapabilityStatus,
  type IpcChannelContract,
} from '../src/services/ipcContractMatrix'
import { summarizeDocuments, type KnowledgeSummary } from '../src/services/knowledgeService'

type PreloadMethod = IpcChannelContract['preload']

interface MainProcessInventory {
  channels: Record<PreloadMethod, Set<string>>
  filesByChannel: Map<string, Set<string>>
  registrationOwnersByFile: Map<string, Set<string>>
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right))
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listTypeScriptFiles(entryPath)
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [entryPath] : []
  })
}

function literalChannel(call: ts.CallExpression): string | null {
  const firstArgument = call.arguments[0]
  return firstArgument && ts.isStringLiteralLike(firstArgument) ? firstArgument.text : null
}

function callName(call: ts.CallExpression): string {
  const expression = call.expression
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.getText()
  return ''
}

function channelKey(preload: PreloadMethod, channel: string): string {
  return `${preload}:${channel}`
}

function collectMainProcessChannels(): MainProcessInventory {
  const channels: Record<PreloadMethod, Set<string>> = {
    invoke: new Set<string>(),
    on: new Set<string>(),
  }
  const filesByChannel = new Map<string, Set<string>>()
  const registrationOwnersByFile = new Map<string, Set<string>>()

  for (const file of listTypeScriptFiles(path.resolve('electron'))) {
    if (file.endsWith(`${path.sep}preload.ts`)) continue
    const relativeFile = path.relative(process.cwd(), file).replaceAll(path.sep, '/')
    const source = readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)

    function record(preload: PreloadMethod, channel: string): void {
      channels[preload].add(channel)
      const files = filesByChannel.get(channelKey(preload, channel)) ?? new Set<string>()
      files.add(relativeFile)
      filesByChannel.set(channelKey(preload, channel), files)
    }

    function visit(node: ts.Node): void {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text.startsWith('register') &&
        node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        const owners = registrationOwnersByFile.get(relativeFile) ?? new Set<string>()
        owners.add(node.name.text)
        registrationOwnersByFile.set(relativeFile, owners)
      }
      if (ts.isCallExpression(node)) {
        const channel = literalChannel(node)
        const name = callName(node)
        if (channel && (name === 'ipcMain.handle' || name === 'registerIpcHandler')) {
          record('invoke', channel)
        }
        if (channel && name.endsWith('.send')) record('on', channel)
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return { channels, filesByChannel, registrationOwnersByFile }
}

function collectRendererChannels(): Record<PreloadMethod, Set<string>> {
  const channels: Record<PreloadMethod, Set<string>> = {
    invoke: new Set<string>(),
    on: new Set<string>(),
  }

  for (const file of listTypeScriptFiles(path.resolve('src'))) {
    if (file.endsWith(`${path.sep}ipcContractMatrix.ts`)) continue
    const source = readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const channel = literalChannel(node)
        const name = callName(node)
        if (channel && (name === 'invoke' || name === 'typedInvoke' || name.endsWith('.invoke'))) {
          channels.invoke.add(channel)
        }
        if (channel && (name === 'onEvent' || name === 'typedOn' || name.endsWith('.on'))) {
          channels.on.add(channel)
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return channels
}

function contractsFor(preload: PreloadMethod): IpcChannelContract[] {
  return IPC_CHANNEL_CONTRACTS.filter((contract) => contract.preload === preload)
}

function splitMarkdownRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let escaped = false
  for (const character of line.slice(1, -1)) {
    if (character === '|' && !escaped) {
      cells.push(current.trim().replaceAll('\\|', '|'))
      current = ''
    } else {
      current += character
    }
    escaped = character === '\\' && !escaped
    if (character !== '\\') escaped = false
  }
  cells.push(current.trim().replaceAll('\\|', '|'))
  return cells
}

function documentedRows(): string[][] {
  const markdown = readFileSync('docs/api/channel-contract-matrix.md', 'utf8')
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^\|\s*`[a-z0-9-]+`\s*\|/.test(line))
    .map(splitMarkdownRow)
}

function expectedDocumentedRow(contract: IpcChannelContract): string[] {
  return [
    `\`${contract.channel}\``,
    `${contract.renderer} -> \`${contract.service}\``,
    `\`${contract.preload}\``,
    `${contract.request} -> ${contract.response}`,
    `\`${contract.ipc}\``,
    `\`${contract.status}\``,
  ]
}

describe('Renderer -> Service -> Preload -> IPC contract matrix', () => {
  const validStatuses = new Set<CapabilityStatus>([
    'available',
    'requires-environment',
    'degraded',
    'placeholder',
  ])

  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('matches both preload allowlists exactly, with no omitted or invented channels', () => {
    expect(sorted(contractsFor('invoke').map((contract) => contract.channel))).toEqual(
      sorted(allowedInvokeChannels),
    )
    expect(sorted(contractsFor('on').map((contract) => contract.channel))).toEqual(
      sorted(allowedEventChannels),
    )
  })

  it('maps every exposed channel to a real main-process handler or event sender', () => {
    const registered = collectMainProcessChannels()

    expect(
      sorted(allowedInvokeChannels).filter((channel) => !registered.channels.invoke.has(channel)),
    ).toEqual([])
    expect(
      sorted(allowedEventChannels).filter((channel) => !registered.channels.on.has(channel)),
    ).toEqual([])

    for (const contract of IPC_CHANNEL_CONTRACTS) {
      const files = registered.filesByChannel.get(channelKey(contract.preload, contract.channel))
      expect(files?.size, `${contract.channel} has no main-process source file`).toBeGreaterThan(0)
      expect(
        [...(files ?? [])].some(
          (file) =>
            contract.ipc === file ||
            registered.registrationOwnersByFile.get(file)?.has(contract.ipc) === true,
        ),
        `${contract.channel} is not registered by ${contract.ipc}`,
      ).toBe(true)
    }
  })

  it('has a real renderer call site for every row that claims a renderer entry', () => {
    const rendererChannels = collectRendererChannels()

    expect(
      sorted(rendererChannels.invoke).filter((channel) => !allowedInvokeChannels.has(channel)),
    ).toEqual([])
    expect(
      sorted(rendererChannels.on).filter((channel) => !allowedEventChannels.has(channel)),
    ).toEqual([])

    for (const contract of IPC_CHANNEL_CONTRACTS.filter(
      (item) => item.renderer !== 'not connected',
    )) {
      expect(
        rendererChannels[contract.preload].has(contract.channel),
        `${contract.channel} claims renderer entry ${contract.renderer}`,
      ).toBe(true)
    }
  })

  it('keeps one complete, auditable row per channel', () => {
    const channels = IPC_CHANNEL_CONTRACTS.map((contract) => contract.channel)
    expect(new Set(channels).size).toBe(channels.length)

    for (const contract of IPC_CHANNEL_CONTRACTS) {
      expect(validStatuses.has(contract.status), `${contract.channel} has an invalid status`).toBe(
        true,
      )
      for (const [field, value] of Object.entries(contract)) {
        expect(String(value).trim(), `${contract.channel}.${field} must be documented`).not.toBe('')
      }
    }
  })

  it('labels real local retrieval separately from disconnected or placeholder capabilities', () => {
    for (const contract of IPC_CHANNEL_CONTRACTS.filter(
      (item) => item.renderer === 'not connected',
    )) {
      expect(contract.status, `${contract.channel} has no renderer entry`).toBe('degraded')
    }

    expect(
      IPC_CHANNEL_CONTRACTS.find((item) => item.channel === 'knowledge-semantic-search')?.status,
    ).toBe('available')
    expect(
      IPC_CHANNEL_CONTRACTS.find((item) => item.channel === 'knowledge-retrieval-status')?.status,
    ).toBe('available')
    expect(
      IPC_CHANNEL_CONTRACTS.find((item) => item.channel === 'knowledge-rag-context')?.status,
    ).toBe('degraded')

    for (const channel of [
      'knowledge-concept-graph',
      'knowledge-concept-detail',
      'knowledge-auto-tag',
      'knowledge-tags',
      'knowledge-tag-documents',
    ]) {
      expect(IPC_CHANNEL_CONTRACTS.find((item) => item.channel === channel)?.status).toBe(
        'placeholder',
      )
    }
  })

  it('keeps the knowledge summary service name and object response aligned with its handler', async () => {
    const invoke = vi.fn().mockResolvedValue({
      summary: 'Keyword fallback summary',
      keyConcepts: ['graph', 'search'],
    } satisfies KnowledgeSummary)
    vi.stubGlobal('window', { api: { invoke, on: vi.fn() } })

    const summaryPromise: Promise<KnowledgeSummary> = summarizeDocuments('graph search')
    await expect(summaryPromise).resolves.toEqual({
      summary: 'Keyword fallback summary',
      keyConcepts: ['graph', 'search'],
    })
    expect(invoke).toHaveBeenCalledWith('knowledge-summarize', 'graph search')

    const contract = IPC_CHANNEL_CONTRACTS.find((item) => item.channel === 'knowledge-summarize')
    expect(contract).toMatchObject({
      service: 'knowledgeStore.summarizeResults / knowledgeService.summarizeDocuments',
      response: 'KnowledgeSummary { summary, keyConcepts }',
      status: 'degraded',
    })
  })

  it('keeps every human-readable table cell in sync with the executable matrix', () => {
    const rows = documentedRows()
    const docsChannels = rows.map((row) => row[0])
    expect(new Set(docsChannels).size).toBe(docsChannels.length)
    expect(rows).toEqual(IPC_CHANNEL_CONTRACTS.map(expectedDocumentedRow))
  })
})
