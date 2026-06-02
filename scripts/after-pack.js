// scripts/after-pack.js
// electron-builder afterPack hook: applies Electron Fuses to the built binary.
// See: https://www.electronjs.org/docs/latest/tutorial/fuses

const { flipFuses, FuseV1Options, FuseVersion } = require('@electron/fuses')
const path = require('path')

/**
 * @param {import('electron-builder').PackContext} context
 */
exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context

  // Determine the Electron binary path per platform
  let electronBinary
  if (electronPlatformName === 'darwin') {
    electronBinary = path.join(
      appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents',
      'MacOS',
      context.packager.appInfo.productFilename,
    )
  } else if (electronPlatformName === 'win32') {
    electronBinary = path.join(appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  } else {
    electronBinary = path.join(appOutDir, context.packager.appInfo.productFilename)
  }

  console.log(`[fuses] Applying Electron Fuses to: ${electronBinary}`)

  await flipFuses(electronBinary, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false, // prevent ELECTRON_RUN_AS_NODE attacks
    [FuseV1Options.EnableCookieEncryption]: true, // encrypt session cookies on disk
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // block NODE_OPTIONS injection
    [FuseV1Options.EnableNodeCliInspectArguments]: false, // block --inspect debugging in production
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true, // validate asar integrity
    [FuseV1Options.OnlyLoadAppFromAsar]: true, // force loading from asar only
  })

  console.log('[fuses] Fuses applied successfully.')
}
