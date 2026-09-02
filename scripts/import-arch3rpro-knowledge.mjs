import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const sourceRoot = resolve(process.argv[2] || join(projectRoot, '.tmp', 'arch3rpro-source'))
const postsRoot = join(sourceRoot, 'posts')
const targetRoot = join(projectRoot, 'site', 'kb')
const dataTarget = join(projectRoot, 'site', 'data', 'importedKnowledge.ts')
const manifestTarget = join(projectRoot, 'docs', 'knowledge-migration-manifest.json')

if (!existsSync(join(sourceRoot, '.git')) || !existsSync(postsRoot)) {
  throw new Error(`Invalid Arch3rPro source checkout: ${sourceRoot}`)
}

const articleDefinitions = [
  ['blog/2024/vitepress-blog/README.md', '技术博客'],
  ['blog/2024/vitepress-blog-2/README.md', '技术博客'],
  ['blog/2025/vitepress-markdown/README.md', '技术博客'],
  ['blog/2025/vitepress-style/README.md', '技术博客'],
  ['blog/2025/vitepress-style-plus/README.md', '技术博客'],
  ['efficiency/mac/mds-stores/README.md', '效率工具'],
  ['efficiency/mac/needful/README.md', '效率工具'],
  ['efficiency/mac/terminal/README.md', '效率工具'],
  ['efficiency/recommend/browser/README.md', '效率工具'],
  ['efficiency/windows/keymap/README.md', '效率工具'],
  ['efficiency/windows/terminal/README.md', '效率工具'],
  ['pentest-tools/top/sqlmap/README.md', '安全工具'],
  ['software/cherrystudio/custom/README.md', 'AI 软件'],
  ['software/cherrystudio/introduce/README.md', 'AI 软件'],
  ['software/cherrystudio/providers/README.md', 'AI 软件'],
  ['software/lobechat/install/README.md', 'AI 软件'],
  ['software/lobechat/setting/README.md', 'AI 软件']
]

const sourceCommit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  const block = match?.[1] || ''
  const scalar = (name) => {
    const value = block.match(new RegExp(`^${name}:\\s*(.*)$`, 'mi'))?.[1]?.trim() || ''
    return value.replace(/^['"]|['"]$/g, '').replace(/^['"]|['"]$/g, '')
  }
  const tagLines = block.split('\n')
  const tags = []
  const tagIndex = tagLines.findIndex((line) => /^tags:\s*/i.test(line))
  if (tagIndex >= 0) {
    const inline = tagLines[tagIndex].replace(/^tags:\s*/i, '').trim()
    if (inline.startsWith('[')) {
      inline.slice(1, -1).split(',').map((tag) => tag.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).forEach((tag) => tags.push(tag))
    } else {
      for (let index = tagIndex + 1; index < tagLines.length; index += 1) {
        const tagMatch = tagLines[index].match(/^\s+-\s+['"]?(.+?)['"]?\s*$/)
        if (!tagMatch) break
        tags.push(tagMatch[1])
      }
    }
  }
  return {
    body: match ? normalized.slice(match[0].length) : normalized,
    title: scalar('title'),
    description: scalar('description'),
    date: scalar('date'),
    author: scalar('author'),
    articleLink: scalar('articleLink'),
    articleGPT: scalar('articleGPT'),
    isOriginal: scalar('isOriginal'),
    tags
  }
}

function yaml(value) {
  return JSON.stringify(String(value || ''))
}

function neutralizeExecutableExamples(text) {
  const lines = text.split('\n')
  const output = []
  let fence = null
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index]
    const fenceMatch = line.trim().match(/^(`{3,}|~{3,})/)
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0]
      else if (fence === fenceMatch[1][0]) fence = null
      output.push(line)
      continue
    }
    if (!fence) {
      const blockMatch = line.trim().match(/^<(script|template|style)\b/i)
      if (blockMatch) {
        const tag = blockMatch[1].toLowerCase()
        const block = [line]
        while (index + 1 < lines.length && !lines[index].toLowerCase().includes(`</${tag}>`)) {
          index += 1
          block.push(lines[index])
          if (lines[index].toLowerCase().includes(`</${tag}>`)) break
        }
        output.push('```vue', ...block, '```')
        continue
      }
      if (/<\/?(?:Linkcard|VPMembers|VPPageTitle|VPTeamMembers|VPTeamPage|VPTeamPageSection|VPTeamPageTitle)\b/.test(line)) {
        output.push(line.replaceAll('<', '&lt;').replaceAll('>', '&gt;'))
        continue
      }
      if (line.trim() === '![LOGO](/logo.png)') line = line.replace('/logo.png', './media/logo.png')
      line = line.replace('src="/video/lol.mp4"', 'src="./media/lol.mp4"')
    }
    output.push(line)
  }
  return output.join('\n')
}

function normalizeTrailingWhitespace(text) {
  const lines = text.split('\n')
  let fence = null
  return lines.map((line) => {
    const fenceMatch = line.trim().match(/^(`{3,}|~{3,})/)
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0]
      else if (fence === fenceMatch[1][0]) fence = null
      return line.replace(/[ \t]+$/g, '')
    }
    if (fence) return line.replace(/[ \t]+$/g, '')
    if (/ {2,}$/.test(line)) return line.replace(/ {2,}$/, '<br>')
    return line.replace(/[ \t]+$/g, '')
  }).join('\n')
}

function localizeExternalContent(text) {
  const lines = text.split('\n')
  const output = []
  let fence = null
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index]
    const fenceMatch = line.trim().match(/^(`{3,}|~{3,})/)
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0]
      else if (fence === fenceMatch[1][0]) fence = null
      output.push(line)
      continue
    }
    if (fence) {
      output.push(line)
      continue
    }
    if (/^\s*<iframe\b/i.test(line)) {
      while (index + 1 < lines.length && !line.toLowerCase().includes('</iframe>')) {
        index += 1
        line += `\n${lines[index]}`
        if (lines[index].toLowerCase().includes('</iframe>')) break
      }
      output.push('> 外部视频演示未在本站加载，地址已记录在本地迁移清单中。')
      continue
    }
    if (/<img\b[^>]*src=["']https?:\/\//i.test(line)) {
      const alt = line.match(/alt=["']([^"']+)["']/i)?.[1] || '外部图片'
      output.push(`\`${alt}\`（外部图片地址已记录在本地迁移清单中）`)
      continue
    }
    line = line.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_match, alt) => `\`${alt || '外部图片'}\`（外部图片地址已留档）`)
    line = line.replace(/(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label, url) => (
      label === url ? `\`${url}\`` : `${label}（\`${url}\`）`
    ))
    const codeParts = line.split(/(`[^`]*`)/g)
    line = codeParts.map((part, partIndex) => {
      if (partIndex % 2 === 1) return part
      return part.replace(/https?:\/\/[^\s<>"'()[\]{}（）]+/g, (url) => `\`${url}\``)
    }).join('')
    output.push(line)
  }
  return output.join('\n')
}

function extractExternalReferences(text) {
  return [...new Set(text.match(/https?:\/\/[^\s<>"')\]]+/g) || [])]
    .map((url) => url.replace(/[.,;，。；]+$/g, ''))
    .sort()
}

function sourceUrl(sourcePath) {
  return `https://github.com/arch3rPro/arch3rpro.github.io/blob/${sourceCommit}/posts/${sourcePath}`
}

function routeFor(sourcePath) {
  return `/kb/${sourcePath.replace(/\/README\.md$/i, '').replaceAll('\\', '/')}/`
}

function destinationFor(sourcePath) {
  return join(targetRoot, sourcePath.replace(/README\.md$/i, 'index.md'))
}

function sourceHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

rmSync(targetRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
mkdirSync(targetRoot, { recursive: true })

const copiedAssetEntries = []
for (const asset of walk(postsRoot).filter((path) => extname(path).toLowerCase() !== '.md')) {
  const rel = relative(postsRoot, asset)
  const target = join(targetRoot, rel)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(asset, target)
  copiedAssetEntries.push({
    sourcePath: `posts/${rel.split(sep).join('/')}`,
    destination: relative(projectRoot, target).split(sep).join('/'),
    sourceSha256: sourceHash(asset)
  })
}

const legacyPublicTargets = [
  join(projectRoot, 'site', 'public', 'logo.png'),
  join(projectRoot, 'site', 'public', 'video', 'lol.mp4')
]
for (const legacyTarget of legacyPublicTargets) {
  if (!existsSync(legacyTarget)) continue
  chmodSync(legacyTarget, 0o666)
  unlinkSync(legacyTarget)
}

const publicAssets = [
  ['logo.png', 'blog/2025/vitepress-markdown/media/logo.png'],
  ['video/lol.mp4', 'blog/2025/vitepress-markdown/media/lol.mp4']
]
for (const [publicAsset, destination] of publicAssets) {
  const source = join(sourceRoot, 'public', ...publicAsset.split('/'))
  if (!existsSync(source)) continue
  const target = join(targetRoot, ...destination.split('/'))
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
  copiedAssetEntries.push({
    sourcePath: `public/${publicAsset}`,
    destination: relative(projectRoot, target).split(sep).join('/'),
    sourceSha256: sourceHash(source)
  })
}

const imported = articleDefinitions.map(([sourcePath, category], index) => {
  const sourceFile = join(postsRoot, ...sourcePath.split('/'))
  const meta = parseFrontmatter(readFileSync(sourceFile, 'utf8'))
  const isReference = /^false$/i.test(meta.isOriginal)
  const originalLink = meta.articleLink.replace(/^['"]+|['"]+$/g, '')
  const title = meta.title || sourcePath.split('/').at(-2)
  const description = meta.description || meta.articleGPT || `${title}的历史知识归档。`
  const destination = destinationFor(sourcePath)
  mkdirSync(dirname(destination), { recursive: true })

  const frontmatter = [
    '---',
    `title: ${yaml(title)}`,
    `description: ${yaml(description)}`,
    `date: ${yaml(meta.date)}`,
    `author: ${yaml(isReference ? meta.author : '白云飞')}`,
    `originalAccount: ${yaml(isReference ? meta.author : 'arch3rPro')}`,
    `originalSource: ${yaml(sourceUrl(sourcePath))}`,
    `sourceCommit: ${yaml(sourceCommit)}`,
    `isReference: ${isReference}`,
    'outline: deep',
    '---',
    ''
  ].join('\n')

  let body
  if (isReference) {
    body = [
      `# ${title}`,
      '',
      '> 此条目在原知识库中明确标注为转载或参考资料。本站不复制第三方正文，仅保留本地摘要、原作者和来源记录。',
      '',
      '## 内容概述',
      '',
      meta.articleGPT || description,
      '',
      '## 原始来源',
      '',
      `- 原作者：${meta.author || '原文作者'}`,
      `- 原文地址（本地留档）：\`${originalLink || sourceUrl(sourcePath)}\``,
      `- 历史源路径：\`posts/${sourcePath}\``,
      '- 本页已经包含可公开展示的摘要，不会跳转到外部网站。',
      ''
    ].join('\n')
  } else {
    const normalizedBody = normalizeTrailingWhitespace(
      localizeExternalContent(
        neutralizeExecutableExamples(meta.body)
          .replaceAll('../2024/vitepress-blog-2', '../vitepress-blog-2/')
      )
    )
    const heading = /^\s*#\s+/m.test(normalizedBody) ? '' : `# ${title}\n\n`
    body = [
      `> 历史知识归档：由白云飞以 arch3rPro 账号首次发布，本次经本人授权迁移。原始发布日期：${meta.date || '未标注'}。`,
      '',
      heading + normalizedBody.trim(),
      '',
      `---`,
      '',
      `本地迁移记录：\`posts/${sourcePath}\` · 源提交：\`${sourceCommit.slice(0, 12)}\` · [查看本地迁移说明](/knowledge#内容与来源边界)`,
      ''
    ].join('\n')
  }

  writeFileSync(destination, frontmatter + body, 'utf8')
  return {
    id: `a${String(index + 1).padStart(2, '0')}`,
    category,
    title,
    description,
    date: meta.date,
    route: routeFor(sourcePath),
    sourcePath,
    sourceUrl: sourceUrl(sourcePath),
    isReference,
    originalAuthor: isReference ? meta.author : '白云飞',
    originalLink: isReference ? originalLink : sourceUrl(sourcePath),
    externalReferences: extractExternalReferences(meta.body),
    sourceSha256: sourceHash(sourceFile),
    destination: relative(projectRoot, destination).split(sep).join('/')
  }
})

const dataFile = `export interface ImportedKnowledgeEntry {\n  id: string\n  category: string\n  title: string\n  description: string\n  date: string\n  route: string\n  sourcePath: string\n  sourceUrl: string\n  isReference: boolean\n  originalAuthor: string\n  originalLink: string\n}\n\nexport const importedKnowledgeEntries: ImportedKnowledgeEntry[] = ${JSON.stringify(imported.map(({ sourceSha256, destination, externalReferences, ...entry }) => entry), null, 2)}\n`
writeFileSync(dataTarget, dataFile, 'utf8')

const manifest = {
  sourceRepository: 'https://github.com/arch3rPro/arch3rpro.github.io',
  sourceCommit,
  importedAt: '2026-09-02',
  authorization: 'User confirmed they are the owner of the Arch3rPro knowledge base.',
  policy: 'Original articles are migrated in full. Entries explicitly marked non-original remain reference-only with author and original link.',
  summary: {
    totalEntries: imported.length,
    fullArticles: imported.filter((entry) => !entry.isReference).length,
    referenceOnly: imported.filter((entry) => entry.isReference).length,
    copiedAssets: copiedAssetEntries.length
  },
  articles: imported,
  assets: copiedAssetEntries
}
mkdirSync(dirname(manifestTarget), { recursive: true })
writeFileSync(manifestTarget, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

console.log(`Source commit: ${sourceCommit}`)
console.log(`Imported entries: ${manifest.summary.totalEntries}`)
console.log(`Full original articles: ${manifest.summary.fullArticles}`)
console.log(`Reference-only entries: ${manifest.summary.referenceOnly}`)
console.log(`Copied assets: ${manifest.summary.copiedAssets}`)
