/* eslint-disable @typescript-eslint/no-require-imports, no-undef -- Node.js smoke harness. */
// Exercises the native host with a real utility root and inherited child process.

const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

if (process.platform !== 'win32') {
  console.log('[smoke-job-host] skipped: Windows-only test.')
  process.exit(0)
}

const root = path.resolve(__dirname, '..')
const hostPath = path.join(root, 'resources', 'bin', 'win32-x64', 'codehelper-job-host.exe')

if (!fs.existsSync(hostPath)) {
  throw new Error(`[smoke-job-host] missing host; run npm run build:job-host first: ${hostPath}`)
}

function waitForLine(child, stream, predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timeout = setTimeout(() => finish(new Error(`${label} timed out`)), timeoutMs)

    const onData = (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (predicate(line)) {
          finish(null, line)
          return
        }
      }
    }
    const onExit = (code, signal) => {
      finish(new Error(`${label} exited early (code=${code}, signal=${signal})`))
    }
    const finish = (error, line) => {
      clearTimeout(timeout)
      stream.off('data', onData)
      child.off('exit', onExit)
      if (error) reject(error)
      else resolve(line)
    }

    stream.on('data', onData)
    child.once('exit', onExit)
  })
}

function waitForExit(child, timeoutMs, label) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.off('exit', onExit)
      reject(new Error(`${label} did not exit`))
    }, timeoutMs)
    const onExit = (code, signal) => {
      clearTimeout(timeout)
      resolve({ code, signal })
    }
    child.once('exit', onExit)
  })
}

function processExists(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error && error.code !== 'ESRCH'
  }
}

const invalid = spawnSync(
  hostPath,
  [
    '--utilityPid',
    '0',
    '--activeProcessLimit',
    '4',
    '--processMemoryMB',
    '128',
    '--jobMemoryMB',
    '256',
  ],
  { encoding: 'utf8', windowsHide: true },
)
if (
  invalid.status === 0 ||
  !/^ERROR .*Win32=87$/m.test(invalid.stdout) ||
  /READY/m.test(invalid.stdout)
) {
  throw new Error(
    `[smoke-job-host] invalid-argument contract failed: status=${invalid.status}, stdout=${JSON.stringify(invalid.stdout)}`,
  )
}

const utilitySource = String.raw`
  const { spawn } = require('child_process')
  process.stdin.setEncoding('utf8')
  process.stdin.once('data', () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    process.stdout.write('CHILD ' + child.pid + '\n')
  })
  setInterval(() => {}, 1000)
`

let utility = null
let host = null
let childPid = null

async function main() {
  utility = spawn(process.execPath, ['-e', utilitySource], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  if (!utility.pid) throw new Error('[smoke-job-host] failed to start utility root')

  host = spawn(
    hostPath,
    [
      '--utilityPid',
      String(utility.pid),
      '--activeProcessLimit',
      '4',
      '--processMemoryMB',
      '128',
      '--jobMemoryMB',
      '256',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  )

  let hostStderr = ''
  host.stderr.on('data', (chunk) => {
    hostStderr += chunk.toString()
  })

  await waitForLine(host, host.stdout, (line) => line === 'READY', 5000, 'host READY')
  utility.stdin.end('GO\n')
  const childLine = await waitForLine(
    utility,
    utility.stdout,
    (line) => /^CHILD \d+$/.test(line),
    5000,
    'utility child',
  )
  childPid = Number(childLine.slice('CHILD '.length))
  if (!Number.isSafeInteger(childPid) || childPid <= 0) {
    throw new Error(`[smoke-job-host] invalid child PID: ${childLine}`)
  }

  utility.kill('SIGTERM')
  const hostExit = await waitForExit(host, 7000, 'host')
  if (hostExit.code !== 0) {
    throw new Error(
      `[smoke-job-host] host failed: code=${hostExit.code}, signal=${hostExit.signal}, stderr=${JSON.stringify(hostStderr)}`,
    )
  }
  if (processExists(childPid)) {
    throw new Error(
      `[smoke-job-host] host exited before the inherited child was fully cleaned up: ${childPid}`,
    )
  }

  console.log(
    `[smoke-job-host] READY observed; utility ${utility.pid} and child ${childPid} cleaned up.`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    if (utility && utility.exitCode === null && utility.signalCode === null) utility.kill('SIGKILL')
    if (host && host.exitCode === null && host.signalCode === null) host.kill('SIGKILL')
    if (childPid && processExists(childPid)) {
      try {
        process.kill(childPid, 'SIGKILL')
      } catch {
        // Best-effort cleanup for a smoke-test process created by this script.
      }
    }
  })
