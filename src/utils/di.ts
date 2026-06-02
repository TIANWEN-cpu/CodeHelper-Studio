/**
 * Lightweight dependency injection container.
 *
 * Provides a simple service registry with three lifecycle scopes:
 * - `singleton` (default): created once, shared across the app
 * - `transient`: created fresh every time it is resolved
 * - `factory`: resolved via a custom factory function that receives the container
 *
 * Usage:
 * ```ts
 * import { container, type ServiceContainer } from '../utils/di'
 *
 * // Register services
 * container.register('logger', () => new Logger(), 'singleton')
 * container.register('httpClient', (c) => new HttpClient(c.resolve('logger')), 'singleton')
 *
 * // Resolve
 * const logger = container.resolve<Logger>('logger')
 *
 * // Auto-registration via decorators would use this same container
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServiceScope = 'singleton' | 'transient' | 'factory'

interface ServiceRegistration<T = unknown> {
  factory: (container: ServiceContainer) => T
  scope: ServiceScope
  instance?: T
}

export interface ServiceContainer {
  /**
   * Register a service with the container.
   */
  register<T>(key: string, factory: (container: ServiceContainer) => T, scope?: ServiceScope): void

  /**
   * Register a pre-created instance as a singleton.
   */
  registerInstance<T>(key: string, instance: T): void

  /**
   * Resolve a service by key. Throws if not registered.
   */
  resolve<T>(key: string): T

  /**
   * Try to resolve a service by key. Returns undefined if not registered.
   */
  tryResolve<T>(key: string): T | undefined

  /**
   * Check if a service is registered.
   */
  has(key: string): boolean

  /**
   * Remove a registered service.
   */
  unregister(key: string): void

  /**
   * Clear all registrations.
   */
  clear(): void

  /**
   * List all registered service keys.
   */
  keys(): string[]
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class DIContainer implements ServiceContainer {
  private services = new Map<string, ServiceRegistration>()

  register<T>(
    key: string,
    factory: (container: ServiceContainer) => T,
    scope: ServiceScope = 'singleton',
  ): void {
    this.services.set(key, { factory, scope })
  }

  registerInstance<T>(key: string, instance: T): void {
    this.services.set(key, {
      factory: () => instance,
      scope: 'singleton',
      instance,
    })
  }

  resolve<T>(key: string): T {
    const reg = this.services.get(key)
    if (!reg) {
      throw new Error(
        `[DI] Service "${key}" is not registered. Available: ${this.keys().join(', ')}`,
      )
    }

    switch (reg.scope) {
      case 'singleton':
      case 'factory': {
        if (reg.instance === undefined) {
          reg.instance = reg.factory(this)
        }
        return reg.instance as T
      }
      case 'transient': {
        return reg.factory(this) as T
      }
    }
  }

  tryResolve<T>(key: string): T | undefined {
    if (!this.has(key)) return undefined
    return this.resolve<T>(key)
  }

  has(key: string): boolean {
    return this.services.has(key)
  }

  unregister(key: string): void {
    this.services.delete(key)
  }

  clear(): void {
    this.services.clear()
  }

  keys(): string[] {
    return Array.from(this.services.keys())
  }
}

// ---------------------------------------------------------------------------
// Singleton container
// ---------------------------------------------------------------------------

export const container = new DIContainer()
