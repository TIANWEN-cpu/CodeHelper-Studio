import { Agent } from 'undici'
import {
  resolveAllowedProviderTarget,
  type ProviderResolver,
  type ResolvedProviderTarget,
} from './providerSecurity'

const MAX_PINNED_AGENTS = 32
const pinnedAgents = new Map<string, Agent>()

function getPinnedAgent(target: ResolvedProviderTarget): Agent {
  const addressKey = target.addresses.map((entry) => `${entry.address}/${entry.family}`).join(',')
  const key = `${new URL(target.url).hostname}|${addressKey}`
  const cached = pinnedAgents.get(key)
  if (cached) {
    pinnedAgents.delete(key)
    pinnedAgents.set(key, cached)
    return cached
  }

  const agent = new Agent({
    connect: {
      autoSelectFamily: target.addresses.length > 1,
      autoSelectFamilyAttemptTimeout: 250,
      lookup: (_hostname, _options, callback) => {
        if (_options.all) {
          callback(null, target.addresses)
        } else {
          callback(null, target.address, target.family)
        }
      },
    },
  })
  pinnedAgents.set(key, agent)

  if (pinnedAgents.size > MAX_PINNED_AGENTS) {
    const oldest = pinnedAgents.entries().next()
    if (!oldest.done) {
      pinnedAgents.delete(oldest.value[0])
      void oldest.value[1].close()
    }
  }

  return agent
}

export async function fetchAllowedProvider(
  url: string,
  init: RequestInit = {},
  resolveHost?: ProviderResolver,
): Promise<Response> {
  const target = await resolveAllowedProviderTarget(url, resolveHost)
  return fetchResolvedProvider(target, init)
}

export function fetchResolvedProvider(
  target: ResolvedProviderTarget,
  init: RequestInit = {},
): Promise<Response> {
  const dispatcher = getPinnedAgent(target)
  return fetch(target.url, {
    ...init,
    redirect: 'manual',
    dispatcher,
  } as RequestInit & { dispatcher: Agent })
}
