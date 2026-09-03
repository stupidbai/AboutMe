import { randomBytes, timingSafeEqual } from 'node:crypto'
import { scryptAsync } from '@noble/hashes/scrypt.js'
import { utf8ToBytes } from '@noble/hashes/utils.js'
import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

const SCRYPT_OPTIONS = { N: 2 ** 16, r: 8, p: 1, dkLen: 32, maxmem: 128 * 8 * (2 ** 16 + 8) }
const USERNAME_PATTERN = /^[\p{L}\p{N}_-]{3,24}$/u
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const text = (value, label, min, max) => {
  if (typeof value !== 'string') throw new Error(`${label}格式无效。`)
  const normalized = value.trim()
  if (normalized.length < min || normalized.length > max) throw new Error(`${label}长度必须为 ${min}-${max} 个字符。`)
  return normalized
}

export const normalizeUsername = value => text(value, '用户名', 3, 24).normalize('NFKC').toLowerCase()
export const normalizeEmail = value => {
  const email = text(value, '邮箱', 5, 254).normalize('NFKC').toLowerCase()
  if (!EMAIL_PATTERN.test(email)) throw new Error('请输入有效的邮箱地址。')
  return email
}

export const validateRegistration = payload => {
  const username = normalizeUsername(payload?.username)
  if (!USERNAME_PATTERN.test(username)) throw new Error('用户名仅支持中文、字母、数字、下划线和短横线。')
  const displayName = text(payload?.displayName, '昵称', 2, 40)
  const email = normalizeEmail(payload?.email)
  const password = text(payload?.password, '密码', 12, 128)
  if (payload?.confirmPassword !== password) throw new Error('两次输入的密码不一致。')
  if (payload?.acceptedTerms !== true) throw new Error('请先同意社区规则与隐私说明。')
  if (payload?.website) throw new Error('注册请求无效。')
  return { username, displayName, email, password }
}

export const validateLogin = payload => ({
  identity: text(payload?.identity, '账号', 3, 254).normalize('NFKC').toLowerCase(),
  password: text(payload?.password, '密码', 1, 128)
})

export const validateProfile = payload => ({
  displayName: text(payload?.displayName, '昵称', 2, 40),
  bio: typeof payload?.bio === 'string' ? payload.bio.trim().slice(0, 240) : ''
})

export const validatePasswordChange = payload => {
  const currentPassword = text(payload?.currentPassword, '当前密码', 1, 128)
  const newPassword = text(payload?.newPassword, '新密码', 12, 128)
  if (payload?.confirmPassword !== newPassword) throw new Error('两次输入的新密码不一致。')
  if (currentPassword === newPassword) throw new Error('新密码不能与当前密码相同。')
  return { currentPassword, newPassword }
}

export const validateComment = payload => ({
  articlePath: normalizeArticlePath(payload?.articlePath),
  parentId: typeof payload?.parentId === 'string' && /^[a-f0-9]{24}$/.test(payload.parentId) ? payload.parentId : '',
  body: text(payload?.body, '评论内容', 2, 3000)
})

export const validateForumPost = payload => ({
  categoryId: text(payload?.categoryId, '板块', 2, 40).toLowerCase(),
  title: text(payload?.title, '帖子标题', 4, 100),
  body: text(payload?.body, '帖子正文', 10, 10000)
})

export const validateForumReply = payload => ({
  parentId: typeof payload?.parentId === 'string' && /^[a-f0-9]{24}$/.test(payload.parentId) ? payload.parentId : '',
  body: text(payload?.body, '回复内容', 2, 5000)
})

export const normalizeArticlePath = value => {
  if (typeof value !== 'string') throw new Error('文章路径无效。')
  const path = value.trim().replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/+$/, '') || '/'
  if (!/^\/(?:kb\/[a-zA-Z0-9/_-]{1,240}|knowledge\/item\/[a-zA-Z0-9_-]{1,80})$/.test(path)) throw new Error('仅知识库文章支持评论。')
  return path
}

export const validateResetPassword = payload => {
  const token = text(payload?.token, '重置令牌', 32, 256)
  const password = text(payload?.password, '新密码', 12, 128)
  if (payload?.confirmPassword !== password) throw new Error('两次输入的新密码不一致。')
  return { token, password }
}

export const hashPassword = async password => {
  const salt = randomBytes(16)
  const derived = await scryptAsync(utf8ToBytes(password), salt, SCRYPT_OPTIONS)
  return `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString('base64')}$${Buffer.from(derived).toString('base64')}`
}

export const verifyPassword = async (password, encoded) => {
  try {
    const [algorithm, n, r, p, saltText, hashText] = String(encoded).split('$')
    if (algorithm !== 'scrypt') return false
    const expected = Buffer.from(hashText, 'base64')
    const derived = Buffer.from(await scryptAsync(utf8ToBytes(password), Buffer.from(saltText, 'base64'), {
      N: Number(n), r: Number(r), p: Number(p), dkLen: expected.length,
      maxmem: 128 * Number(r) * (Number(n) + Number(p) + 8)
    }))
    return expected.length === derived.length && timingSafeEqual(expected, derived)
  } catch {
    return false
  }
}

marked.use({ gfm: true, breaks: true })

export const renderCommunityContent = markdown => sanitizeHtml(marked.parse(String(markdown || ''), { async: false }), {
  allowedTags: ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'hr'],
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  transformTags: {
    a: (_tagName, attribs) => ({ tagName: 'a', attribs: { ...attribs, target: '_blank', rel: 'nofollow noopener noreferrer' } })
  }
})

export const contentExcerpt = (markdown, max = 180) => String(markdown || '')
  .replace(/[`#>*_~\[\]()!-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

export const publicUser = user => user ? ({
  id: user.id,
  username: user.username,
  displayName: user.displayName ?? user.display_name,
  role: user.role,
  bio: user.bio || '',
  createdAt: user.createdAt ?? user.created_at
}) : null
