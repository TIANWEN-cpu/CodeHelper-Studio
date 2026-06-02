/**
 * Plugin manager — handles registration, lifecycle, and orchestration of plugins.
 *
 * Plugins are registered, resolved for dependencies, then initialized in order.
 * The manager is a singleton that integrates with the event bus, command registry,
 * and the DI container.
 *
 * Usage:
 * ```ts
 * import { pluginManager } from '../plugins/pluginManager'
 * import { myPlugin } from '../plugins/myPlugin'
 *
 * // Register plugins before app.start()
 * pluginManager.register(myPlugin)
 *
 * // Initialize all plugins (called once at startup)
 * await pluginManager.initAll()
 *
 * // Destroy all plugins (called at shutdown)
 * await pluginManager.destroyAll()
 * ```
 */

import { eventBus } from '../utils/eventBus'
import { container } from '../utils/di'
import type { Plugin, PluginContext } from './types'
import type { AppEvents } from '../utils/eventBus'

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const registeredPlugins = new Map<string, Plugin>()
const initializedPlugins = new Set<string>()
const commandRegistry = new Map<string, (...args: unknown[]) => unknown>()
const pluginCleanupFns = new Map<string, Array<() => void>>()

// ---------------------------------------------------------------------------
// Plugin context factory
// ---------------------------------------------------------------------------

function createContext(pluginId: string): PluginContext {
  const cleanups = pluginCleanupFns.get(pluginId) ?? []
  pluginCleanupFns.set(pluginId, cleanups)

  return {
    on<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): () => void {
      const unsub = eventBus.on(event, listener)
      cleanups.push(unsub)
      return unsub
    },

    emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): void {
      eventBus.emit(event, data)
    },

    registerCommand(
      commandId: string,
      handler: (...args: unknown[]) => unknown | Promise<unknown>,
    ): void {
      if (commandRegistry.has(commandId)) {
        console.warn(`[PluginManager] Command "${commandId}" already registered, overwriting.`)
      }
      commandRegistry.set(commandId, handler)
    },

    executeCommand(commandId: string, ...args: unknown[]): unknown | Promise<unknown> {
      const handler = commandRegistry.get(commandId)
      if (!handler) {
        throw new Error(`[PluginManager] Unknown command: "${commandId}"`)
      }
      return handler(...args)
    },

    resolve<T>(key: string): T {
      return container.resolve<T>(key)
    },
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a plugin. Must be called before `initAll()`.
 */
function register(plugin: Plugin): void {
  if (registeredPlugins.has(plugin.id)) {
    throw new Error(`[PluginManager] Plugin "${plugin.id}" is already registered.`)
  }
  registeredPlugins.set(plugin.id, plugin)
}

/**
 * Unregister a plugin. If it was already initialized, it will be destroyed first.
 */
async function unregister(pluginId: string): Promise<void> {
  if (initializedPlugins.has(pluginId)) {
    await destroyPlugin(pluginId)
  }
  registeredPlugins.delete(pluginId)
}

/**
 * Initialize all registered plugins in dependency order.
 * Throws if there are circular dependencies.
 */
async function initAll(): Promise<void> {
  const order = resolveDependencyOrder()

  for (const pluginId of order) {
    const plugin = registeredPlugins.get(pluginId)!
    const ctx = createContext(pluginId)

    try {
      await plugin.init(ctx)
      initializedPlugins.add(pluginId)
      console.log(`[PluginManager] Initialized: ${plugin.name} v${plugin.version}`)
    } catch (error) {
      console.error(`[PluginManager] Failed to initialize "${pluginId}":`, error)
      throw error
    }
  }

  // afterAllInit phase
  for (const pluginId of order) {
    const plugin = registeredPlugins.get(pluginId)!
    if (plugin.afterAllInit) {
      try {
        await plugin.afterAllInit()
      } catch (error) {
        console.error(`[PluginManager] afterAllInit failed for "${pluginId}":`, error)
      }
    }
  }
}

/**
 * Destroy all initialized plugins in reverse initialization order.
 */
async function destroyAll(): Promise<void> {
  const order = resolveDependencyOrder().reverse()

  for (const pluginId of order) {
    if (initializedPlugins.has(pluginId)) {
      await destroyPlugin(pluginId)
    }
  }
}

/**
 * Get a list of all registered plugins with their status.
 */
function listPlugins(): Array<{
  id: string
  name: string
  version: string
  initialized: boolean
  dependencies: string[]
}> {
  return Array.from(registeredPlugins.values()).map((p) => ({
    id: p.id,
    name: p.name,
    version: p.version,
    initialized: initializedPlugins.has(p.id),
    dependencies: p.dependencies ?? [],
  }))
}

/**
 * Execute a command registered by a plugin.
 */
function executeCommand(commandId: string, ...args: unknown[]): unknown | Promise<unknown> {
  const handler = commandRegistry.get(commandId)
  if (!handler) {
    throw new Error(`[PluginManager] Unknown command: "${commandId}"`)
  }
  return handler(...args)
}

/**
 * Check if a command is registered.
 */
function hasCommand(commandId: string): boolean {
  return commandRegistry.has(commandId)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function destroyPlugin(pluginId: string): Promise<void> {
  const plugin = registeredPlugins.get(pluginId)
  if (!plugin) return

  try {
    await plugin.destroy()
  } catch (error) {
    console.error(`[PluginManager] Error destroying "${pluginId}":`, error)
  }

  // Auto-cleanup event listeners registered via context.on()
  const cleanups = pluginCleanupFns.get(pluginId)
  if (cleanups) {
    for (const fn of cleanups) {
      try {
        fn()
      } catch {
        // ignore cleanup errors
      }
    }
    pluginCleanupFns.delete(pluginId)
  }

  initializedPlugins.delete(pluginId)
}

/**
 * Topological sort of plugins by dependencies.
 * Throws on circular dependencies or missing deps.
 */
function resolveDependencyOrder(): string[] {
  const ids = Array.from(registeredPlugins.keys())
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const order: string[] = []

  function visit(id: string): void {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      throw new Error(`[PluginManager] Circular dependency detected involving "${id}".`)
    }

    const plugin = registeredPlugins.get(id)
    if (!plugin) {
      throw new Error(`[PluginManager] Plugin "${id}" depends on unregistered plugin.`)
    }

    visiting.add(id)
    for (const dep of plugin.dependencies ?? []) {
      if (!registeredPlugins.has(dep)) {
        throw new Error(`[PluginManager] Plugin "${id}" requires "${dep}" which is not registered.`)
      }
      visit(dep)
    }
    visiting.delete(id)
    visited.add(id)
    order.push(id)
  }

  for (const id of ids) {
    visit(id)
  }
  return order
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const pluginManager = {
  register,
  unregister,
  initAll,
  destroyAll,
  listPlugins,
  executeCommand,
  hasCommand,
}
