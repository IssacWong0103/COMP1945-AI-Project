export type ActivityKind =
  | 'run_started'
  | 'run_completed'
  | 'run_failed'
  | 'run_partial'
  | 'tryon_started'
  | 'tryon_ready'
  | 'tryon_failed'
  | 'swap_applied'
  | 'look_saved'
  | 'look_removed'
  | 'alert'

export type ActivityItem = {
  id: string
  kind: ActivityKind
  title: string
  detail?: string
  href?: string
  at: string
}

export type AlertItem = {
  id: string
  severity: 'info' | 'warning' | 'error'
  title: string
  detail: string
  href?: string
  at: string
  dismissed?: boolean
}

const ACTIVITY_KEY = 'ustyle.activity.v1'
const ALERTS_KEY = 'ustyle.alerts.v1'
const SAVED_LOOKS_KEY = 'ustyle.savedLooks.v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function listActivity(limit = 40): ActivityItem[] {
  return readJson<ActivityItem[]>(ACTIVITY_KEY, []).slice(0, limit)
}

export function pushActivity(input: Omit<ActivityItem, 'id' | 'at'> & { at?: string }): ActivityItem {
  const item: ActivityItem = {
    id: uid(),
    at: input.at ?? new Date().toISOString(),
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    href: input.href,
  }
  const next = [item, ...listActivity(200)].slice(0, 100)
  writeJson(ACTIVITY_KEY, next)
  return item
}

export function listAlerts(): AlertItem[] {
  return readJson<AlertItem[]>(ALERTS_KEY, []).filter((a) => !a.dismissed)
}

export function pushAlert(input: Omit<AlertItem, 'id' | 'at' | 'dismissed'> & { at?: string }): AlertItem {
  const item: AlertItem = {
    id: uid(),
    at: input.at ?? new Date().toISOString(),
    severity: input.severity,
    title: input.title,
    detail: input.detail,
    href: input.href,
  }
  const next = [item, ...readJson<AlertItem[]>(ALERTS_KEY, [])].slice(0, 50)
  writeJson(ALERTS_KEY, next)
  return item
}

export function dismissAlert(id: string) {
  const all = readJson<AlertItem[]>(ALERTS_KEY, []).map((item) =>
    item.id === id ? { ...item, dismissed: true } : item,
  )
  writeJson(ALERTS_KEY, all)
}

export function clearDismissedAlerts() {
  writeJson(
    ALERTS_KEY,
    readJson<AlertItem[]>(ALERTS_KEY, []).filter((item) => !item.dismissed),
  )
}

export type LocalSavedLook = {
  id: string
  venue: string
  overallScore: number
  createdAt: string
  thumbnailUrl: string | null
  items?: Array<{ id: string; category: string; imageUrl: string; description: string; color: string }>
}

export function listLocalSavedLooks(): LocalSavedLook[] {
  return readJson<LocalSavedLook[]>(SAVED_LOOKS_KEY, [])
}

export function saveLocalLook(look: LocalSavedLook) {
  const existing = listLocalSavedLooks().filter((item) => item.id !== look.id)
  writeJson(SAVED_LOOKS_KEY, [look, ...existing].slice(0, 40))
}

export function removeLocalLook(id: string) {
  writeJson(
    SAVED_LOOKS_KEY,
    listLocalSavedLooks().filter((item) => item.id !== id),
  )
}
