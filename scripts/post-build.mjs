// Cross-platform post-build copy step for Next.js standalone output.
// Replaces the Linux-only `cp -r` calls so the build works on Windows, macOS, and Linux.

import { cp, mkdir, access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const standaloneDir = resolve(root, '.next', 'standalone')

async function copy(src, dest, label) {
  if (!existsSync(src)) {
    console.warn(`[post-build] Skipping ${label}: source missing (${src})`)
    return
  }
  await mkdir(resolve(dest, '..'), { recursive: true })
  await cp(src, dest, { recursive: true, force: true, errorOnExist: false })
  console.log(`[post-build] Copied ${label} → ${dest}`)
}

async function main() {
  if (!existsSync(standaloneDir)) {
    console.error(`[post-build] .next/standalone does not exist. Did "next build" run with output: "standalone"?`)
    process.exit(1)
  }

  // .next/static is required by the standalone server for serving static chunks
  await copy(
    resolve(root, '.next', 'static'),
    resolve(standaloneDir, '.next', 'static'),
    'static assets',
  )

  // public/ is required by the standalone server for serving public files
  await copy(
    resolve(root, 'public'),
    resolve(standaloneDir, 'public'),
    'public folder',
  )

  console.log('[post-build] Done.')
}

main().catch((err) => {
  console.error('[post-build] Failed:', err)
  process.exit(1)
})
