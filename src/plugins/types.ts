/**
 * Plugin type definitions and lifecycle interface.
 *
 * Plugins extend the CodeHelper application with new capabilities
 * without modifying core code. Each plugin declares its metadata,
 * optional dependencies, and lifecycle hooks.
 *
 * Usage:
 * ```ts
 * import type { Plugin, PluginContext } from './types'
 *
 * const myPlugin: Plugin = {
 *   id: 'my-plugin',
 *   name: 'My Plugin',
 *   version: '1.0.0',
 *   description: 'Adds custom functionality',
 *
 *   init(ctx) {
 *     ctx.on('problem:selected', (id) => { ... })
 *     ctx.registerCommand('my-plugin.doSomething', () => { ... })
 *   },
 *
 *   destroy() {
 *     // cleanup
 *   },
 * }
 * ```
 */

import type { AppEvents } from '../utils/eventBus'

// ---------------------------------------------------------------------------
// Plugin context — available during lifecycle hooks
// ---------------------------------------------------------------------------

/**
 * Context provided to plugin lifecycle methods.
 * Plugins use this to interact with the host application.
 */
export interface PluginContext {
  /**
   * Subscribe to an application event. Returns an unsubscribe function.
   */
  on<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): () => void

  /**
   * Emit an application event.
   */
  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): void

  /**
   * Register a named command that can be invoked later via `executeCommand`.
   */
  registerCommand(
    commandId: string,
    handler: (...args: unknown[]) => unknown | Promise<unknown>,
  ): void

  /**
   * Execute a previously registered command.
   */
  executeCommand(commandId: string, ...args: unknown[]): unknown | Promise<unknown>

  /**
   * Access the service container for resolving or registering services.
   */
  resolve<T>(key: string): T
}

// ---------------------------------------------------------------------------
// Plugin interface
// ---------------------------------------------------------------------------

export interface PluginMetadata {
  /** Unique identifier (e.g. 'code-formatter'). */
  id: string
  /** Human-readable name. */
  name: string
  /** Semver version string. */
  version: string
  /** Short description of what the plugin does. */
  description?: string
  /** Author name or identifier. */
  author?: string
  /** IDs of plugins that must be loaded before this one. */
  dependencies?: string[]
}

export interface Plugin extends PluginMetadata {
  /**
   * Called when the plugin is first loaded.
   * Use the context to register event listeners, commands, and services.
   */
  init(ctx: PluginContext): void | Promise<void>

  /**
   * Called when the plugin is being unloaded or the app is shutting down.
   * Clean up any resources (timers, listeners, file handles, etc.).
   */
  destroy(): void | Promise<void>

  /**
   * Optional: called after all plugins have been initialized.
   * Use this for cross-plugin coordination that requires all plugins to be ready.
   */
  afterAllInit?(): void | Promise<void>
}
