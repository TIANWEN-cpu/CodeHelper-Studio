import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface WindowsPackagePowerShellHelpers {
  buildAuthenticodePowerShellScript(): string
  createWindowsPowerShellEnvironment(
    overrides?: NodeJS.ProcessEnv,
    baseEnvironment?: NodeJS.ProcessEnv,
  ): NodeJS.ProcessEnv
}

const require = createRequire(import.meta.url)
const helpers = require('../scripts/verify-windows-package.cjs') as WindowsPackagePowerShellHelpers

describe('Windows package PowerShell compatibility', () => {
  it('removes inherited PowerShell module paths before launching Windows PowerShell', () => {
    const environment = helpers.createWindowsPowerShellEnvironment(
      { CODEHELPER_SIGNATURE_PATH: 'D:\\package\\CodeHelper.exe' },
      {
        Path: 'C:\\Windows\\System32',
        PSModulePath: 'C:\\Program Files\\PowerShell\\7\\Modules',
        PSMODULEPATH: 'C:\\host-incompatible-modules',
      },
    )

    expect(Object.keys(environment).some((key) => key.toLowerCase() === 'psmodulepath')).toBe(false)
    expect(environment.Path).toBe('C:\\Windows\\System32')
    expect(environment.CODEHELPER_SIGNATURE_PATH).toBe('D:\\package\\CodeHelper.exe')
  })

  it('loads the host-local security module and uses its qualified Authenticode command', () => {
    const script = helpers.buildAuthenticodePowerShellScript()

    expect(script).toContain(
      "$securityModule = Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1'",
    )
    expect(script).toContain('Test-Path -LiteralPath $securityModule -PathType Leaf')
    expect(script).toContain('Import-Module -Name $securityModule -Force -ErrorAction Stop')
    expect(script).toContain(
      'Microsoft.PowerShell.Security\\Get-AuthenticodeSignature -LiteralPath $env:CODEHELPER_SIGNATURE_PATH',
    )
    expect(script).not.toMatch(/^\$signature = Get-AuthenticodeSignature/m)
  })
})
