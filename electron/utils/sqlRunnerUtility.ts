import { executeSqlRequest } from './sqlRunnerCore'
import type { SqlRunnerRequest, SqlRunnerResponse } from './sqlRunnerProtocol'

const parentPort = (process as NodeJS.Process & { parentPort?: Electron.ParentPort }).parentPort
if (!parentPort) throw new Error('SQL utility process parent port is unavailable')

function respond(response: SqlRunnerResponse): void {
  parentPort.postMessage(response)
  setImmediate(() => process.exit(response.ok ? 0 : 1))
}

parentPort.once('message', (event) => {
  try {
    respond(executeSqlRequest(event.data as SqlRunnerRequest))
  } catch (error) {
    respond({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})
