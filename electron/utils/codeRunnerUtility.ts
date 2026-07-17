import { runCodeSnippetDirect } from './codeRunner'
import { isCodeRunnerUtilityRequest, type CodeRunnerUtilityResponse } from './codeRunnerProtocol'

const parentPort = (process as NodeJS.Process & { parentPort?: Electron.ParentPort }).parentPort
if (!parentPort) throw new Error('Code runner utility parent port is unavailable')

let requestReceived = false

function respond(response: CodeRunnerUtilityResponse): void {
  parentPort.postMessage(response)
  setImmediate(() => process.exit(response.kind === 'result' ? 0 : 1))
}

parentPort.on('message', (event) => {
  if (requestReceived) return
  requestReceived = true
  if (!isCodeRunnerUtilityRequest(event.data)) {
    respond({ kind: 'error', error: 'Runner utility received an invalid request' })
    return
  }

  const request = event.data
  void runCodeSnippetDirect(request.code, request.language, request.stdin, request.toolchain).then(
    (result) => respond({ kind: 'result', result }),
    (error: unknown) =>
      respond({ kind: 'error', error: error instanceof Error ? error.message : String(error) }),
  )
})
