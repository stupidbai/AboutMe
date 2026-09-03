import {
  hashPassword, normalizeArticlePath, renderCommunityContent, validateComment,
  validateForumPost, validatePasswordChange, validateRegistration, verifyPassword
} from './community-service.mjs'

const registration = validateRegistration({
  username: 'Test_User', displayName: '测试用户', email: 'TEST@example.com',
  password: 'Secure123', confirmPassword: 'Secure123', acceptedTerms: true, website: ''
})
if (registration.username !== 'test_user' || registration.email !== 'test@example.com') throw new Error('注册字段规范化失败。')
for (const invalid of [
  { ...registration, confirmPassword: 'wrong', acceptedTerms: true },
  { ...registration, password: 'passwordonly', confirmPassword: 'passwordonly', acceptedTerms: true },
  { ...registration, confirmPassword: registration.password, acceptedTerms: false }
]) {
  let rejected = false
  try { validateRegistration(invalid) } catch { rejected = true }
  if (!rejected) throw new Error('无效注册信息未被拒绝。')
}

const encoded = await hashPassword('Secure123')
if (!encoded.startsWith('scrypt$65536$8$1$') || !await verifyPassword('Secure123', encoded) || await verifyPassword('Wrong123', encoded)) {
  throw new Error('scrypt 密码哈希或恒定时间校验失败。')
}

validatePasswordChange({ currentPassword: 'Secure123', newPassword: 'Changed456', confirmPassword: 'Changed456' })
if (normalizeArticlePath('/kb/blog/security/?x=1#top') !== '/kb/blog/security') throw new Error('知识文章路径规范化失败。')
if (validateComment({ articlePath: '/kb/blog/security', body: '安全评论' }).body !== '安全评论') throw new Error('评论校验失败。')
if (validateForumPost({ categoryId: 'AI', title: '论坛功能测试', body: '这是一段长度足够的测试正文。' }).categoryId !== 'ai') throw new Error('论坛内容校验失败。')

const html = renderCommunityContent('**安全内容** <script>alert(1)</script> [危险](javascript:alert(1)) [链接](https://example.com)')
if (/<script/i.test(html) || /javascript:/i.test(html) || !html.includes('noopener noreferrer') || !html.includes('<strong>安全内容</strong>')) {
  throw new Error('社区 Markdown 白名单清洗失败。')
}

console.log('Registration, password and content validation: verified')
console.log('scrypt password hashing and verification: verified')
console.log('Markdown rendering and XSS sanitization: verified')
