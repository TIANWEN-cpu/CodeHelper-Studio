#!/usr/bin/env node
// scripts/version-bump.js
// Semantic versioning utility for CodeHelper.
// Usage:
//   node scripts/version-bump.js patch      # 1.0.0 -> 1.0.1
//   node scripts/version-bump.js minor      # 1.0.0 -> 1.1.0
//   node scripts/version-bump.js major      # 1.0.0 -> 2.0.0
//   node scripts/version-bump.js prepatch   # 1.0.0 -> 1.0.1-0
//   node scripts/version-bump.js preminor   # 1.0.0 -> 1.1.0-0
//   node scripts/version-bump.js premajor   # 1.0.0 -> 2.0.0-0
//   node scripts/version-bump.js 1.2.3      # set exact version

const fs = require('fs')
const path = require('path')

const VALID_RELEASES = ['patch', 'minor', 'major', 'prepatch', 'preminor', 'premajor', 'prerelease']
const VERSION_REGEX = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/

const pkgPath = path.resolve(__dirname, '..', 'package.json')

function parseVersion(version) {
  const match = version.match(VERSION_REGEX)
  if (!match) {
    throw new Error(`Invalid version format: ${version}`)
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
  }
}

function formatVersion(v) {
  let str = `${v.major}.${v.minor}.${v.patch}`
  if (v.prerelease) {
    str += `-${v.prerelease}`
  }
  return str
}

function bumpVersion(current, release) {
  const v = parseVersion(current)

  switch (release) {
    case 'patch':
      return { major: v.major, minor: v.minor, patch: v.patch + 1, prerelease: null }
    case 'minor':
      return { major: v.major, minor: v.minor + 1, patch: 0, prerelease: null }
    case 'major':
      return { major: v.major + 1, minor: 0, patch: 0, prerelease: null }
    case 'prepatch': {
      if (v.prerelease) {
        // Already a prerelease, bump patch part
        return { major: v.major, minor: v.minor, patch: v.patch, prerelease: null }
      }
      return { major: v.major, minor: v.minor, patch: v.patch + 1, prerelease: '0' }
    }
    case 'preminor':
      return { major: v.major, minor: v.minor + 1, patch: 0, prerelease: '0' }
    case 'premajor':
      return { major: v.major + 1, minor: 0, patch: 0, prerelease: '0' }
    case 'prerelease': {
      if (v.prerelease) {
        const num = parseInt(v.prerelease, 10)
        if (!isNaN(num)) {
          return { ...v, prerelease: String(num + 1) }
        }
        return { ...v, prerelease: `${v.prerelease}.1` }
      }
      return { major: v.major, minor: v.minor, patch: v.patch + 1, prerelease: '0' }
    }
    default:
      throw new Error(`Unknown release type: ${release}`)
  }
}

function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error(
      'Usage: node version-bump.js <patch|minor|major|prepatch|preminor|premajor|prerelease|X.Y.Z>',
    )
    process.exit(1)
  }

  const input = args[0]

  // Read current package.json
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  const currentVersion = pkg.version

  let newVersion

  if (VALID_RELEASES.includes(input)) {
    // Bump by release type
    const bumped = bumpVersion(currentVersion, input)
    newVersion = formatVersion(bumped)
  } else if (VERSION_REGEX.test(input)) {
    // Exact version provided
    newVersion = input
  } else {
    console.error(`Invalid argument: ${input}`)
    console.error(`Expected one of: ${VALID_RELEASES.join(', ')}, or an exact version (e.g. 1.2.3)`)
    process.exit(1)
  }

  // Validate new version is greater than current
  const current = parseVersion(currentVersion)
  const next = parseVersion(newVersion)
  const currentNum = current.major * 1000000 + current.minor * 1000 + current.patch
  const nextNum = next.major * 1000000 + next.minor * 1000 + next.patch

  if (nextNum < currentNum && !next.prerelease) {
    console.error(
      `Error: New version (${newVersion}) is lower than current version (${currentVersion})`,
    )
    process.exit(1)
  }

  // Update package.json
  pkg.version = newVersion
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')

  console.log(`Version bumped: ${currentVersion} -> ${newVersion}`)

  // Output for CI consumption
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${newVersion}\ntag=v${newVersion}\n`)
  }
}

main()
