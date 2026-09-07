const accents = new Set(['cyan', 'blue', 'violet', 'orange', 'green'])

const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象。`)
  return value
}
const text = (value, label, max = 1000) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空。`)
  if (value.trim().length > max) throw new Error(`${label} 不能超过 ${max} 个字符。`)
  return value.trim()
}
const optionalText = (value, label, max = 1000) => {
  if (value === undefined || value === null || value === '') return ''
  return text(value, label, max)
}
const list = (value, label, min = 0, max = 30) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`${label} 数量必须在 ${min}-${max} 之间。`)
  }
  return value
}
const urlOrPath = (value, label) => {
  const result = text(value, label, 500)
  if (result.startsWith('/')) return result
  try {
    const parsed = new URL(result)
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) return result
  } catch {}
  throw new Error(`${label} 必须是站内路径或 http(s) 地址。`)
}
const card = (value, label, withCode = false) => {
  const item = object(value, label)
  const result = {
    title: text(item.title, `${label}标题`, 120),
    description: text(item.description, `${label}说明`, 600)
  }
  if (withCode) result.code = text(item.code, `${label}代码`, 60)
  return result
}

export const validateSiteConfig = payload => {
  const root = object(payload, '站点配置')
  const identity = object(root.identity, '个人信息')
  const home = object(root.home, '首页')
  const contact = object(root.contact, '联系方式')
  const cooperation = object(root.cooperation, '合作方向')

  return {
    identity: {
      name: text(identity.name, '姓名', 60),
      currentRole: text(identity.currentRole, '当前职位', 120),
      subtitle: text(identity.subtitle, '身份副标题', 160),
      focus: text(identity.focus, '聚焦方向', 240),
      capabilities: text(identity.capabilities, '核心能力', 240),
      city: text(identity.city, '城市', 80)
    },
    home: {
      kicker: text(home.kicker, '首页眉题', 160),
      title: text(home.title, '首页标题', 160),
      highlight: text(home.highlight, '首页强调标题', 160),
      lead: text(home.lead, '首页简介', 600),
      primaryAction: {
        label: text(object(home.primaryAction, '主按钮').label, '主按钮文字', 40),
        link: urlOrPath(home.primaryAction.link, '主按钮链接')
      },
      secondaryAction: {
        label: text(object(home.secondaryAction, '次按钮').label, '次按钮文字', 40),
        link: urlOrPath(home.secondaryAction.link, '次按钮链接')
      },
      directoryTitle: text(home.directoryTitle, '目录标题', 160),
      directoryDescription: text(home.directoryDescription, '目录说明', 300),
      focusTitle: text(home.focusTitle, '主线标题', 160),
      focusDescription: text(home.focusDescription, '主线说明', 300)
    },
    contact: {
      title: text(contact.title, '联系标题', 180),
      description: text(contact.description, '联系说明', 600),
      phone: text(contact.phone, '电话', 40),
      email: text(contact.email, '邮箱', 120),
      city: text(contact.city, '联系城市', 80),
      publicAccount: text(contact.publicAccount, '公众号', 100),
      wechatQr: urlOrPath(contact.wechatQr, '微信二维码路径'),
      wechatLabel: text(contact.wechatLabel, '微信标题', 80),
      wechatHint: text(contact.wechatHint, '微信提示', 180)
    },
    metrics: list(root.metrics, '核心数据', 1, 12).map((item, index) => {
      const metric = object(item, `核心数据 ${index + 1}`)
      return { value: text(metric.value, `核心数据 ${index + 1}数值`, 30), label: text(metric.label, `核心数据 ${index + 1}说明`, 100) }
    }),
    routes: list(root.routes, '首页目录', 1, 20).map((item, index) => {
      const route = object(item, `目录 ${index + 1}`)
      const accent = text(route.accent, `目录 ${index + 1}颜色`, 20)
      if (!accents.has(accent)) throw new Error(`目录 ${index + 1}颜色无效。`)
      return {
        code: text(route.code, `目录 ${index + 1}代码`, 60),
        title: text(route.title, `目录 ${index + 1}标题`, 120),
        description: text(route.description, `目录 ${index + 1}说明`, 400),
        link: urlOrPath(route.link, `目录 ${index + 1}链接`),
        tags: list(route.tags, `目录 ${index + 1}标签`, 0, 8).map((tag, tagIndex) => text(tag, `目录 ${index + 1}标签 ${tagIndex + 1}`, 40)),
        accent,
        enabled: route.enabled !== false
      }
    }),
    focusAreas: list(root.focusAreas, '工作主线', 1, 12).map((item, index) => card(item, `工作主线 ${index + 1}`, true)),
    timeline: list(root.timeline, '履历时间线', 1, 30).map((item, index) => {
      const row = object(item, `履历 ${index + 1}`)
      return {
        period: text(row.period, `履历 ${index + 1}时间`, 80),
        organization: text(row.organization, `履历 ${index + 1}组织`, 160),
        role: text(row.role, `履历 ${index + 1}角色`, 160),
        description: text(row.description, `履历 ${index + 1}说明`, 600),
        current: row.current === true
      }
    }),
    cooperation: {
      title: text(cooperation.title, '合作页标题', 180),
      description: text(cooperation.description, '合作页说明', 600),
      stages: list(cooperation.stages, '合作阶段', 1, 12).map((item, index) => card(item, `合作阶段 ${index + 1}`, true)),
      directions: list(cooperation.directions, '合作方向', 1, 12).map((item, index) => {
        const direction = card(item, `合作方向 ${index + 1}`)
        return {
          ...direction,
          items: list(item.items, `合作方向 ${index + 1}要点`, 1, 10).map((entry, entryIndex) => text(entry, `合作方向 ${index + 1}要点 ${entryIndex + 1}`, 160))
        }
      }),
      process: list(cooperation.process, '合作流程', 1, 12).map((item, index) => card(item, `合作流程 ${index + 1}`))
    }
  }
}
