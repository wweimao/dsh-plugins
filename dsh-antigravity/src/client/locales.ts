/** Locale namespace owned by the Anti Gravity settings page. */
export const NS = 'settings.antiGravity'

/** English strings and key source of truth. */
export const en = {
  nav: 'Anti Gravity',
  title: 'Google Anti Gravity',
  intro: 'Connect using the official Antigravity App configuration; no IDE installation is required. After migrating, use Sign in again to authorize the App’s AI Code scope. This does not change your subscription or enable paid overages.',
  configured: 'Signed in',
  missing: 'Not signed in',
  source: 'Credential source: {source}',
  signIn: 'Sign in with Google',
  signInAgain: 'Sign in again',
  signingIn: 'Starting sign-in…',
  waiting: 'Complete authorization in the opened Google page.',
  openAuthorization: 'Open authorization page',
  succeeded: 'Authorization completed.',
  failed: 'Authorization failed',
  cancelled: 'Authorization was cancelled.',
  signOut: 'Sign out',
  signingOut: 'Signing out…',
  loadFailed: 'Could not read Anti Gravity login status.',
} as const

/** Translation keys rendered by the Anti Gravity settings page. */
export type AntiGravityLocaleKey = keyof typeof en

/** Chinese strings matching {@link en}. */
export const zh: Record<AntiGravityLocaleKey, string> = {
  nav: 'Anti Gravity',
  title: 'Google Anti Gravity',
  intro: '使用官方 Antigravity App 配置连接 Google，不再依赖 IDE。迁移后请点击“重新登录”，确认 App 使用的 AI Code 权限；不会更改订阅或开启额外付费额度。',
  configured: '已登录',
  missing: '尚未登录',
  source: '凭据来源：{source}',
  signIn: '使用 Google 登录',
  signInAgain: '重新登录',
  signingIn: '正在启动登录…',
  waiting: '请在已打开的 Google 页面完成授权。',
  openAuthorization: '打开授权页面',
  succeeded: '授权完成。',
  failed: '授权失败',
  cancelled: '授权已取消。',
  signOut: '退出登录',
  signingOut: '正在退出…',
  loadFailed: '无法读取 Anti Gravity 登录状态。',
}
