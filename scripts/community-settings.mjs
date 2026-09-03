const clean = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : ''

export const defaultCommunitySettings = Object.freeze({
  registrationEnabled: true,
  requireEmailVerification: false,
  publicSiteUrl: 'http://127.0.0.1:4173',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpFrom: '',
  turnstileEnabled: false,
  turnstileSiteKey: ''
})

export const validateCommunitySettings = payload => {
  const result = {
    registrationEnabled: payload?.registrationEnabled !== false,
    requireEmailVerification: Boolean(payload?.requireEmailVerification),
    publicSiteUrl: clean(payload?.publicSiteUrl || defaultCommunitySettings.publicSiteUrl, 500).replace(/\/$/, ''),
    smtpHost: clean(payload?.smtpHost, 255),
    smtpPort: Number(payload?.smtpPort || 587),
    smtpSecure: Boolean(payload?.smtpSecure),
    smtpUser: clean(payload?.smtpUser, 255),
    smtpFrom: clean(payload?.smtpFrom, 320),
    smtpPassword: typeof payload?.smtpPassword === 'string' ? payload.smtpPassword.slice(0, 1000) : '',
    clearSmtpPassword: Boolean(payload?.clearSmtpPassword),
    turnstileEnabled: Boolean(payload?.turnstileEnabled),
    turnstileSiteKey: clean(payload?.turnstileSiteKey, 255),
    turnstileSecret: typeof payload?.turnstileSecret === 'string' ? payload.turnstileSecret.slice(0, 1000) : '',
    clearTurnstileSecret: Boolean(payload?.clearTurnstileSecret)
  }
  let siteUrl
  try { siteUrl = new URL(result.publicSiteUrl) } catch { throw new Error('公开站点地址必须是有效的 URL。') }
  if (!['http:', 'https:'].includes(siteUrl.protocol)) throw new Error('公开站点地址仅支持 http 或 https。')
  if (!Number.isInteger(result.smtpPort) || result.smtpPort < 1 || result.smtpPort > 65535) throw new Error('SMTP 端口必须在 1-65535 之间。')
  if (result.requireEmailVerification && (!result.smtpHost || !result.smtpFrom)) throw new Error('启用邮箱验证前，请填写 SMTP 主机和发件人。')
  if (result.turnstileEnabled && !result.turnstileSiteKey) throw new Error('启用 Turnstile 前，请填写站点密钥。')
  return result
}

export const publicCommunitySettings = settings => ({
  registrationEnabled: settings.registrationEnabled,
  requireEmailVerification: settings.requireEmailVerification,
  turnstileEnabled: settings.turnstileEnabled,
  turnstileSiteKey: settings.turnstileSiteKey
})
