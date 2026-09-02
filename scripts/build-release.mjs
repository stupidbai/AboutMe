import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const packageMetadata = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const version = packageMetadata.version
const releaseRoot = resolve(root, 'release')
const packageName = 'bai-yunfei-portal-v' + version
const staging = resolve(releaseRoot, packageName)

if (!releaseRoot.startsWith(root + sep) || !staging.startsWith(releaseRoot + sep)) {
  throw new Error('发布目录解析结果超出项目范围。')
}
mkdirSync(releaseRoot, { recursive: true })
rmSync(staging, { recursive: true, force: true })
rmSync(resolve(releaseRoot, packageName + '.tar.gz'), { force: true })
rmSync(resolve(releaseRoot, packageName + '.zip'), { force: true })
mkdirSync(staging, { recursive: true })

const copyEntries = [
  ['dist', 'dist'],
  ['config/cases.json', 'config/cases.json'],
  ['config/site-config.json', 'config/site-config.json'],
  ['scripts/serve-with-admin.mjs', 'scripts/serve-with-admin.mjs'],
  ['scripts/database.mjs', 'scripts/database.mjs'],
  ['scripts/case-schema.mjs', 'scripts/case-schema.mjs'],
  ['scripts/site-config-schema.mjs', 'scripts/site-config-schema.mjs'],
  ['install', 'install'],
  ['bin', 'bin'],
  ['.env.example', '.env.example'],
  ['docs/DEPLOYMENT.md', 'INSTALL.md']
]
const copyTree = (source, target) => {
  const stat = lstatSync(source)
  if (!stat.isDirectory()) {
    mkdirSync(resolve(target, '..'), { recursive: true })
    copyFileSync(source, target)
    return
  }
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source)) copyTree(resolve(source, entry), resolve(target, entry))
}
for (const [source, destination] of copyEntries) {
  const target = resolve(staging, destination)
  copyTree(resolve(root, source), target)
}

writeFileSync(resolve(staging, 'package.json'), JSON.stringify({
  name: 'bai-yunfei-portal-runtime',
  version,
  private: true,
  type: 'module',
  scripts: {
    start: 'node scripts/serve-with-admin.mjs'
  },
  engines: {
    node: '>=22.16'
  }
}, null, 2) + '\n', 'utf8')
writeFileSync(resolve(staging, 'VERSION'), version + '\n', 'utf8')
if (process.platform !== 'win32') {
  chmodSync(resolve(staging, 'install/linux/install.sh'), 0o755)
  chmodSync(resolve(staging, 'bin/start-linux.sh'), 0o755)
}

const runArchive = (command, args, label) => {
  const result = spawnSync(command, args, { cwd: releaseRoot, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(label + '生成失败：' + (result.stderr || result.stdout))
}

const tarName = packageName + '.tar.gz'
runArchive('tar', ['-czf', tarName, packageName], 'tar.gz 安装包')

let zipName = ''
if (process.platform === 'win32') {
  zipName = packageName + '.zip'
  runArchive('tar', ['-a', '-cf', zipName, packageName], 'ZIP 安装包')
} else {
  const zipResult = spawnSync('zip', ['-qr', packageName + '.zip', packageName], { cwd: releaseRoot, encoding: 'utf8' })
  if (zipResult.status === 0) zipName = packageName + '.zip'
}

const artifacts = [tarName, zipName].filter(Boolean)
const checksums = artifacts.map(file => {
  const digest = createHash('sha256').update(readFileSync(resolve(releaseRoot, file))).digest('hex')
  return digest + '  ' + file
})
writeFileSync(resolve(releaseRoot, 'SHA256SUMS.txt'), checksums.join('\n') + '\n', 'utf8')

console.log('Release directory: ' + staging)
for (const artifact of artifacts) console.log('Package: ' + basename(resolve(releaseRoot, artifact)))
console.log('Checksums: SHA256SUMS.txt')
