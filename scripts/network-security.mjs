import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const privateV4 = address => {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && [18, 19].includes(b))
}

const privateV6 = address => {
  const normalized = address.toLowerCase().split('%')[0]
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)) return true
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  return mapped ? privateV4(mapped) : false
}

export const isPrivateAddress = address => isIP(address) === 4 ? privateV4(address) : privateV6(address)

export const assertSafeOutboundUrl = async (value, { allowPrivateNetwork = false } = {}) => {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('AI 接口必须使用 http:// 或 https://。')
  if (url.username || url.password) throw new Error('AI 接口地址不能包含账号或密码。')
  if (allowPrivateNetwork) return url
  if (['localhost', 'localhost.localdomain'].includes(url.hostname.toLowerCase()) || url.hostname.toLowerCase().endsWith('.local')) {
    throw new Error('AI 接口指向本机或内网；如确需连接本地模型，请在管理页显式允许内网接口。')
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) {
    throw new Error('AI 接口解析到内网、回环或保留地址，已阻止连接。')
  }
  return url
}
