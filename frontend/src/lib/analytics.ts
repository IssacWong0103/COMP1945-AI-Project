/**
 * Studio funnel telemetry.
 * Events mirror the BA handoff metrics plan.
 */

export type AnalyticsEventName =
  | 'studio_run_started'
  | 'studio_run_completed'
  | 'studio_run_failed'
  | 'studio_run_partial'
  | 'studio_swap_opened'
  | 'studio_swap_applied'
  | 'studio_tryon_started'
  | 'studio_tryon_ready'
  | 'studio_tryon_failed'
  | 'studio_look_saved'
  | 'studio_retry_clicked'
  | 'studio_refine_submitted'
  | 'nav_tab_opened'

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>

type AnalyticsSink = (name: AnalyticsEventName, props?: AnalyticsProps) => void

const buffer: Array<{ name: AnalyticsEventName; props?: AnalyticsProps; at: string }> = []
let sink: AnalyticsSink | null = null

export function setAnalyticsSink(next: AnalyticsSink | null) {
  sink = next
}

export function track(name: AnalyticsEventName, props?: AnalyticsProps) {
  const entry = { name, props, at: new Date().toISOString() }
  buffer.push(entry)
  if (buffer.length > 200) buffer.shift()
  if (sink) {
    sink(name, props)
    return
  }
  if (import.meta.env.DEV) {
    console.info('[analytics]', name, props ?? {})
  }
}

export function getAnalyticsBuffer() {
  return [...buffer]
}

export function clearAnalyticsBuffer() {
  buffer.length = 0
}

/** Success metrics used by Activity / QA dashboards. */
export const STUDIO_SUCCESS_METRICS = [
  { id: 'run_completion_rate', label: 'Run completion rate', formula: 'completed / started' },
  { id: 'tryon_success_rate', label: 'Try-on success rate', formula: 'ready / started' },
  { id: 'swap_apply_rate', label: 'Swap apply rate', formula: 'applied / opened' },
  { id: 'save_rate', label: 'Save rate', formula: 'saved / completed_runs' },
  { id: 'retry_rate', label: 'Retry rate', formula: 'retries / failed_or_partial' },
] as const
