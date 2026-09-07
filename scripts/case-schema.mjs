const requiredText = (value, label, maxLength = 5000) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空。`)
  if (value.trim().length > maxLength) throw new Error(`${label}内容过长。`)
  return value.trim()
}

const optionalText = (value, maxLength = 5000) => {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || value.trim().length > maxLength) throw new Error('可选文本字段格式无效。')
  return value.trim()
}

const isHttpUrl = value => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const assetPath = (value, label) => {
  const path = requiredText(value, label, 1000)
  if (!path.startsWith('/') && !isHttpUrl(path)) {
    throw new Error(`${label}必须以 / 开头或使用 http/https。`)
  }
  return path
}

export const sanitizeCase = (item, index) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`第 ${index + 1} 个案例格式无效。`)
  const id = requiredText(item.id, '案例编号', 8)
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`案例 ${id} 的编号只能包含字母、数字、下划线或连字符。`)
  const category = requiredText(item.category, `案例 ${id} 分类`, 20)
  if (!['delivery', 'community', 'ecosystem'].includes(category)) throw new Error(`案例 ${id} 的分类无效。`)
  const nasUrl = optionalText(item.nasUrl, 2000)
  if (nasUrl && !isHttpUrl(nasUrl)) throw new Error(`案例 ${id} 的 NAS 地址必须使用 http/https。`)

  const tags = Array.isArray(item.tags)
    ? [...new Set(item.tags.map(tag => requiredText(tag, `案例 ${id} 标签`, 50)))].slice(0, 12)
    : []
  const partners = Array.isArray(item.partners)
    ? item.partners.slice(0, 12).map(partner => ({
        name: requiredText(partner?.name, `案例 ${id} 合作伙伴名称`, 80),
        logo: assetPath(partner?.logo, `案例 ${id} 合作伙伴标识`)
      }))
    : []

  const sanitized = {
    id,
    category,
    title: requiredText(item.title, `案例 ${id} 标题`, 200),
    kicker: requiredText(item.kicker, `案例 ${id} 分类说明`, 200),
    description: requiredText(item.description, `案例 ${id} 介绍`, 5000),
    image: assetPath(item.image, `案例 ${id} 图片路径`),
    imageAlt: optionalText(item.imageAlt, 500),
    tags,
    nasUrl
  }
  const outcome = optionalText(item.outcome, 80)
  const outcomeLabel = optionalText(item.outcomeLabel, 200)
  if (outcome) sanitized.outcome = outcome
  if (outcomeLabel) sanitized.outcomeLabel = outcomeLabel
  if (item.contain === true) sanitized.contain = true
  if (partners.length) sanitized.partners = partners
  return sanitized
}

export const validateCases = payload => {
  if (!Array.isArray(payload)) throw new Error('案例配置必须是数组。')
  if (payload.length > 99) throw new Error('案例数量不能超过 99 个。')
  const sanitized = payload.map(sanitizeCase)
  const ids = sanitized.map(item => item.id)
  if (new Set(ids).size !== ids.length) throw new Error('案例编号不能重复。')
  return sanitized
}
