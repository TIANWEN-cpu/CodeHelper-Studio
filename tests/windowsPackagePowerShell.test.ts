import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface WindowsPackagePowerShellHelpers {
  buildAuthenticodePowerShellScript(): string
  createWindowsPowerShellEnvironment(
    overrides?: NodeJS.ProcessEnv,
    baseEnvironment?: NodeJS.ProcessEnv,
  ): NodeJS.ProcessEnv
  requireAuthenticodePolicy(
    name: string,
    signature: {
      status: string
      signerSubject?: string | null
      signerThumbprint?: string | null
      timestampThumbprint?: string | null
    },
    signatureRequired?: boolean,
  ): void
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

  it('accepts only the exact NotSigned status for an unsigned release', () => {
    expect(() =>
      helpers.requireAuthenticodePolicy('CodeHelper-Installer.exe', { status: 'NotSigned' }, false),
    ).not.toThrow()

    for (const status of ['UnknownError', 'HashMismatch', 'Valid']) {
      expect(() =>
        helpers.requireAuthenticodePolicy('CodeHelper-Installer.exe', { status }, false),
      ).toThrow(`signature is ${status}; expected NotSigned`)
    }

    expect(() =>
      helpers.requireAuthenticodePolicy(
        'CodeHelper-Installer.exe',
        { status: 'NotSigned', signerSubject: 'CN=Unexpected Publisher' },
        false,
      ),
    ).toThrow('unexpectedly contains signing certificate evidence')
  })

  it('keeps signed release validation strict', () => {
    expect(() =>
      helpers.requireAuthenticodePolicy(
        'CodeHelper-Installer.exe',
        {
          status: 'Valid',
          signerThumbprint: 'A'.repeat(40),
          timestampThumbprint: 'B'.repeat(40),
        },
        true,
      ),
    ).not.toThrow()

    expect(() =>
      helpers.requireAuthenticodePolicy('CodeHelper-Installer.exe', { status: 'NotSigned' }, true),
    ).toThrow('signature is NotSigned')
  })
})
