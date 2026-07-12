/* eslint-disable @typescript-eslint/no-require-imports, no-undef -- Electron smoke harness runs as CommonJS. */
const { app, utilityProcess } = require('electron')
const { existsSync } = require('fs')
const { join, resolve } = require('path')

const utilityPath = process.env.CODEHELPER_SQL_UTILITY_PATH
  ? resolve(process.env.CODEHELPER_SQL_UTILITY_PATH)
  : join(__dirname, '..', 'out', 'main', 'sqlRunnerUtility.js')

function request(statements, queryLast) {
  return {
    statements,
    queryLast,
    maxRows: 1000,
    maxOutputBytes: 512 * 1024,
    maxCellBytes: 64 * 1024,
  }
}

function runUtility(payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(utilityPath, [], {
      serviceName: 'CodeHelper SQL Utility Smoke',
      stdio: 'pipe',
    })
    let response
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('SQL utility smoke test timed out'))
    }, timeoutMs)

    child.once('spawn', () => child.postMessage(payload))
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.once('message', (message) => {
      response = message
    })
    child.once('error', (type, location) => {
      clearTimeout(timer)
      reject(new Error(`SQL utility fatal error: ${type} (${location})`))
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (response === undefined) {
        reject(new Error(`SQL utility exited without response (${code}): ${stderr.trim()}`))
      } else resolve(response)
    })
  })
}

function verifyKillableInfiniteQuery() {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(utilityPath, [], {
      serviceName: 'CodeHelper SQL Utility Timeout Smoke',
      stdio: 'pipe',
    })
    const hardTimeout = setTimeout(() => {
      child.kill()
      reject(new Error('Infinite SQL utility did not exit after kill'))
    }, 5000)

    child.once('spawn', () => {
      child.postMessage(
        request(
          [
            'WITH RECURSIVE cnt(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM cnt) SELECT count(*) FROM cnt',
          ],
          true,
        ),
      )
      setTimeout(() => child.kill(), 300)
    })
    child.once('message', () => {
      clearTimeout(hardTimeout)
      reject(new Error('Infinite SQL unexpectedly completed before termination'))
    })
    child.once('exit', () => {
      clearTimeout(hardTimeout)
      resolve()
    })
  })
}

app
  .whenReady()
  .then(async () => {
    if (!existsSync(utilityPath)) throw new Error(`Missing SQL utility bundle: ${utilityPath}`)

    const response = await runUtility(
      request(
        [
          'CREATE TABLE values_table(value INTEGER)',
          'INSERT INTO values_table VALUES (21), (21)',
          'SELECT SUM(value) AS total FROM values_table',
        ],
        true,
      ),
    )
    if (!response || response.ok !== true) {
      throw new Error(`SQL utility returned an error: ${JSON.stringify(response)}`)
    }
    const rows = JSON.parse(response.stdout)
    if (rows[0]?.total !== 42) throw new Error(`Unexpected SQL result: ${response.stdout}`)

    const finiteCte = await runUtility(
      request(
        [
          'WITH RECURSIVE cnt(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM cnt WHERE x < 3) SELECT SUM(x) AS total FROM cnt',
        ],
        true,
      ),
    )
    if (!finiteCte || finiteCte.ok !== true || JSON.parse(finiteCte.stdout)[0]?.total !== 6) {
      throw new Error(`Finite CTE failed: ${JSON.stringify(finiteCte)}`)
    }

    await verifyKillableInfiniteQuery()
  })
  .then(() => {
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
