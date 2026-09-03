import nodemailer from 'nodemailer'

const transporterFor = settings => {
  if (!settings.smtpHost || !settings.smtpFrom) throw new Error('SMTP 尚未配置完整。')
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPassword } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000
  })
}

const safeName = value => String(value || '朋友').replace(/[<>]/g, '').slice(0, 40)

export const sendVerificationEmail = async (settings, { to, displayName, token }) => {
  const verifyUrl = new URL('/account', settings.publicSiteUrl)
  verifyUrl.searchParams.set('verify', token)
  await transporterFor(settings).sendMail({
    from: settings.smtpFrom,
    to,
    subject: '验证你的社区邮箱',
    text: `${safeName(displayName)}，请在 30 分钟内打开以下链接完成邮箱验证：\n${verifyUrl}`,
    html: `<p>${safeName(displayName)}，你好：</p><p>请在 30 分钟内点击以下链接完成邮箱验证。</p><p><a href="${verifyUrl}">验证邮箱</a></p><p>如果不是你发起的注册，请忽略本邮件。</p>`
  })
}

export const sendPasswordResetEmail = async (settings, { to, displayName, token }) => {
  const resetUrl = new URL('/account', settings.publicSiteUrl)
  resetUrl.searchParams.set('reset', token)
  await transporterFor(settings).sendMail({
    from: settings.smtpFrom,
    to,
    subject: '重置你的社区密码',
    text: `${safeName(displayName)}，请在 30 分钟内打开以下链接重置密码：\n${resetUrl}`,
    html: `<p>${safeName(displayName)}，你好：</p><p>请在 30 分钟内点击以下链接重置密码。</p><p><a href="${resetUrl}">重置密码</a></p><p>如果不是你发起的操作，请忽略本邮件。</p>`
  })
}

export const testSmtpConnection = settings => transporterFor(settings).verify()
