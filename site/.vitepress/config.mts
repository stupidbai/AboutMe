import { defineConfig } from 'vitepress'

const isGitHubPages = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  lang: 'zh-CN',
  title: '白云飞 · 企业 AI 合作与知识主页',
  titleTemplate: ':title｜白云飞',
  description: '白云飞个人网站：企业 AI、可信数字化、解决方案交付、生态合作、项目案例与长期思考。',
  base: isGitHubPages ? '/AboutMe/' : '/',
  cleanUrls: true,
  lastUpdated: true,
  appearance: 'dark',
  outDir: '../dist',
  head: [
    ['meta', { name: 'theme-color', content: '#071f2b' }],
    ['meta', { name: 'author', content: '白云飞' }],
    ['link', { rel: 'icon', href: isGitHubPages ? '/AboutMe/logo.svg' : '/logo.svg', type: 'image/svg+xml' }]
  ],
  markdown: {
    lineNumbers: true,
    image: { lazyLoading: true }
  },
  sitemap: {
    hostname: 'https://stupidbai.github.io/AboutMe/'
  },
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: '白云飞 · 个人主页',
    nav: [
      { text: '首页', link: '/' },
      { text: '履历', link: '/profile' },
      { text: '合作', link: '/cooperation' },
      { text: '案例', link: '/cases' },
      { text: '主题地图', link: '/insights' },
      { text: '生活', link: '/life' },
      { text: '联系', link: '/contact' }
    ],
    outline: {
      label: '页面导航',
      level: [2, 3]
    },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索站点' },
          modal: {
            noResultsText: '未找到相关内容',
            resetButtonTitle: '清除查询',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' }
          }
        }
      }
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/stupidbai/AboutMe' }
    ],
    lastUpdated: {
      text: '最后更新',
      formatOptions: { dateStyle: 'medium', timeStyle: 'short' }
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    footer: {
      message: '目标清晰 · 资源互补 · 重视交付',
      copyright: 'Copyright © 2026 白云飞'
    }
  }
})
