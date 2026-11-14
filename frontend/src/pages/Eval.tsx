import { useEffect, useState } from 'react'
import {
  addEvalDatasetItem,
  deleteEvalDatasetItem,
  getEvalDataset,
  getEvalStatus,
  getEvalSummary,
  runEvaluation,
  updateEvalDatasetItem,
} from '../api/client'

type UploadMetrics = {
  counts?: Record<string, number>
  screening?: Record<string, unknown>
  tagging?: Record<string, number | null>
  heuristic_baseline?: { tagging?: Record<string, number | null> }
}

type ConditionMetrics = {
  cases?: number
  overall_mean?: number | null
  venue_fit_mean?: number | null
  cohesion_mean?: number | null
  complete_rate?: number | null
  fallback_rate?: number | null
}

type EvalSummary = {
  generated_at?: string
  git_revision?: string
  upload?: UploadMetrics
  recommend?: {
    conditions?: Record<string, ConditionMetrics>
    full_vs_no_reference?: Record<string, number>
    full_vs_random?: Record<string, number>
  }
  latency?: Record<string, Record<string, number | null | string[]>>
  functional?: {
    passed?: number
    failed?: number
    skipped?: number
    pass_rate?: number | null
    cases?: Array<Record<string, unknown>>
  }
}

function fmt(value: unknown, suffix = ''): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return `${Number.isInteger(value) ? value : value.toFixed(3)}${suffix}`
  return `${value}${suffix}`
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="mb-1 flex items-center gap-2 text-xs">
      <span className="w-36 shrink-0 truncate text-muted">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded bg-canvas">
        <div className="h-full rounded bg-navy" style={{ width: `${width}%` }} />
      </div>
      <span className="w-14 text-right tabular-nums text-ink">{fmt(value)}</span>
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-xl border border-line bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-navy">{title}</h2>
      {hint ? <p className="mb-3 text-xs leading-relaxed text-muted">{hint}</p> : null}
      {children}
    </section>
  )
}

function MetricTable({
  rows,
}: {
  rows: Array<Array<unknown>>
}) {
  if (rows.length <= 1) return <p className="text-sm text-muted">No data.</p>
  const [head, ...body] = rows
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {head.map((cell, i) => (
            <th key={i} className="border border-line bg-canvas px-2 py-1 text-left font-medium text-ink">
              {fmt(cell)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci} className="border border-line px-2 py-1 text-muted">
                {fmt(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const CLASS_OPTIONS = [
  ['valid_single', 'Valid single garment'],
  ['model_worn', 'Model / person wearing clothes'],
  ['multi_item', 'Multiple items'],
  ['collage', 'Collage'],
  ['irrelevant', 'Irrelevant (not clothing)'],
  ['unreadable', 'Unreadable / blurry'],
] as const

function DatasetCard() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [expectedClass, setExpectedClass] = useState('valid_single')
  const [category, setCategory] = useState('top')
  const [color, setColor] = useState('')
  const [style, setStyle] = useState('casual')
  const [formality, setFormality] = useState('50')
  const [gender, setGender] = useState('unisex')
  const [notes, setNotes] = useState('')

  const load = () => {
    getEvalDataset()
      .then((d) => {
        setItems(d.items)
        setCounts(d.counts)
        setLoaded(true)
      })
      .catch((err: unknown) => {
        setMessage(err instanceof Error ? err.message : String(err))
        setLoaded(true)
      })
  }

  useEffect(() => {
    load()
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setFile(null)
    setExpectedClass('valid_single')
    setCategory('top')
    setColor('')
    setStyle('casual')
    setFormality('50')
    setGender('unisex')
    setNotes('')
  }

  const startEdit = (item: Record<string, unknown>) => {
    setEditingId(String(item.case_id ?? ''))
    setFile(null)
    setExpectedClass(String(item.expected_class ?? 'valid_single'))
    setCategory(String(item.expected_category ?? 'top'))
    setColor(String(item.expected_color ?? ''))
    setStyle(String(item.expected_style ?? 'casual'))
    setFormality(String(item.expected_formality ?? '50'))
    setGender(String(item.expected_gender ?? 'unisex'))
    setNotes(String(item.notes ?? ''))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      if (editingId) {
        const patch: Record<string, unknown> = {
          expected_class: expectedClass,
          expected_category: expectedClass === 'valid_single' ? category : '',
          expected_color: color,
          expected_style: expectedClass === 'valid_single' ? style : '',
          expected_formality: expectedClass === 'valid_single' ? Number(formality) : null,
          expected_gender: expectedClass === 'valid_single' ? gender : '',
          notes,
        }
        await updateEvalDatasetItem(editingId, patch)
        setMessage('Item updated.')
      } else {
        if (!file) {
          setMessage('Choose an image file first.')
          setSaving(false)
          return
        }
        const body = new FormData()
        body.append('file', file)
        body.append('expected_class', expectedClass)
        body.append('expected_category', expectedClass === 'valid_single' ? category : '')
        body.append('expected_color', color)
        body.append('expected_style', expectedClass === 'valid_single' ? style : '')
        body.append('expected_formality', expectedClass === 'valid_single' ? formality : '')
        body.append('expected_gender', expectedClass === 'valid_single' ? gender : '')
        body.append('notes', notes)
        await addEvalDatasetItem(body)
        setMessage('Item added.')
      }
      resetForm()
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: Record<string, unknown>) => {
    if (!window.confirm(`Delete ${String(item.filename)} and its labels?`)) return
    try {
      await deleteEvalDatasetItem(String(item.case_id ?? ''))
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const isGarment = expectedClass === 'valid_single'
  const inputCls =
    'w-full rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-navy'

  return (
    <Card
      title="Evaluation dataset"
      hint="Add the real test images and their ground-truth labels here. Each image is saved to evaluation/data/uploads/ and its label row to upload_labels.csv — the exact inputs the Run evaluation button measures. Valid single-garment images need a category (plus color/style/formality/gender); negative cases only need a class and an optional note."
    >
      <div className="mb-3 flex items-center gap-3 text-xs text-muted">
        <span>{counts.total ?? 0} labeled items</span>
        <span>· {counts.valid_single ?? 0} valid</span>
        <span>· {counts.negative ?? 0} negative</span>
      </div>

      <form onSubmit={submit} className="mb-4 grid gap-2 rounded-lg border border-line bg-canvas p-3 sm:grid-cols-2 lg:grid-cols-3">
        {!editingId ? (
          <label className="text-xs text-muted">
            Image file
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs"
            />
          </label>
        ) : (
          <p className="text-xs text-muted">Editing {editingId}</p>
        )}

        <label className="text-xs text-muted">
          Class
          <select value={expectedClass} onChange={(e) => setExpectedClass(e.target.value)} className={`mt-1 ${inputCls}`}>
            {CLASS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        {isGarment ? (
          <>
            <label className="text-xs text-muted">
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={`mt-1 ${inputCls}`}>
                {['top', 'bottom', 'outerwear', 'dress', 'shoes', 'accessory'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Color
              <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. navy" className={`mt-1 ${inputCls}`} />
            </label>
            <label className="text-xs text-muted">
              Style
              <select value={style} onChange={(e) => setStyle(e.target.value)} className={`mt-1 ${inputCls}`}>
                {['casual', 'smartCasual', 'streetwear', 'sporty', 'minimal', 'formal'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Formality (0–100)
              <input type="number" min={0} max={100} value={formality} onChange={(e) => setFormality(e.target.value)} className={`mt-1 ${inputCls}`} />
            </label>
            <label className="text-xs text-muted">
              Gender
              <select value={gender} onChange={(e) => setGender(e.target.value)} className={`mt-1 ${inputCls}`}>
                {['male', 'female', 'unisex'].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        <label className="text-xs text-muted sm:col-span-2">
          Note
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional note (e.g. uncertain about color)" className={`mt-1 ${inputCls}`} />
        </label>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-navy px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add item'}
          </button>
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-lg border border-line px-3 py-2 text-xs text-muted">
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {message ? <p className="mb-2 text-xs text-muted">{message}</p> : null}

      {loaded && items.length === 0 ? (
        <p className="text-xs text-muted">No labeled images yet. Add your first item above.</p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-line bg-canvas px-2 py-1 text-left font-medium text-ink">Image</th>
              <th className="border border-line bg-canvas px-2 py-1 text-left font-medium text-ink">Class</th>
              <th className="border border-line bg-canvas px-2 py-1 text-left font-medium text-ink">Labels</th>
              <th className="border border-line bg-canvas px-2 py-1 text-left font-medium text-ink">Note</th>
              <th className="border border-line bg-canvas px-2 py-1 text-left font-medium text-ink">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={String(item.case_id)}>
                <td className="border border-line px-2 py-1">
                  <img
                    src={`/api/eval/dataset/image?path=${encodeURIComponent(String(item.filename))}`}
                    alt=""
                    className="h-10 w-8 rounded object-cover"
                  />
                </td>
                <td className="border border-line px-2 py-1 text-muted">{fmt(item.expected_class)}</td>
                <td className="border border-line px-2 py-1 text-muted">
                  {String(item.expected_class) === 'valid_single'
                    ? [item.expected_category, item.expected_color, item.expected_style, item.expected_formality, item.expected_gender]
                        .filter((v) => v !== null && v !== undefined && v !== '')
                        .join(' · ')
                    : '—'}
                </td>
                <td className="border border-line px-2 py-1 text-muted">{fmt(item.notes) || '—'}</td>
                <td className="border border-line px-2 py-1">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEdit(item)} className="text-xs font-medium text-navy">
                      Edit
                    </button>
                    <button type="button" onClick={() => void remove(item)} className="text-xs font-medium text-danger">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

export function EvalPage() {
  const [summary, setSummary] = useState<EvalSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [runStatus, setRunStatus] = useState<Record<string, unknown> | null>(null)
  const [starting, setStarting] = useState(false)

  const loadSummary = () => {
    getEvalSummary()
      .then((data) => {
        setSummary(data as EvalSummary)
        setError(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setLoading(false))
  }

  const loadStatus = () => {
    getEvalStatus()
      .then((data) => setRunStatus(data as Record<string, unknown>))
      .catch(() => setRunStatus(null))
  }

  useEffect(() => {
    loadSummary()
    loadStatus()
  }, [])

  useEffect(() => {
    if (runStatus?.state !== 'running') return
    const id = window.setInterval(() => loadStatus(), 2000)
    return () => window.clearInterval(id)
  }, [runStatus?.state])

  useEffect(() => {
    if (runStatus?.state === 'done') loadSummary()
  }, [runStatus?.state])

  const startRun = async () => {
    setStarting(true)
    try {
      const result = await runEvaluation()
      setRunStatus(result as Record<string, unknown>)
    } catch (err) {
      setRunStatus({ state: 'error', error: err instanceof Error ? err.message : String(err) })
    } finally {
      setStarting(false)
    }
  }

  const running = runStatus?.state === 'running' || starting
  const statusStep = runStatus?.step ? String(runStatus.step).replace(/_/g, ' ') : ''
  const runButton = (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={running}
        onClick={() => void startRun()}
        className="rounded-lg bg-navy px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? `Running… ${statusStep}` : 'Run evaluation'}
      </button>
      {runStatus?.state === 'done' ? (
        <span className="text-xs text-success">Finished — numbers above are up to date.</span>
      ) : null}
      {runStatus?.state === 'error' ? (
        <span className="text-xs text-danger">{String(runStatus.error ?? 'Run failed')}</span>
      ) : null}
    </div>
  )

  if (loading) return <p className="text-sm text-muted">Loading evaluation summary…</p>
  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-xl border border-line bg-white p-5 text-sm text-muted">
          <p className="font-medium text-ink">No evaluation summary available.</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2">Run the evaluation from the button below, or run <code>evaluation/scripts/analyze.py</code> after the pipeline.</p>
          {runButton}
        </div>
        <div className="mt-5">
          <DatasetCard />
        </div>
      </div>
    )
  }
  if (!summary) return null

  const upload = summary.upload
  const tagging = upload?.tagging ?? {}
  const screening = upload?.screening ?? {}
  const cm = (screening.confusion_matrix ?? {}) as Record<string, number>
  const conds = summary.recommend?.conditions ?? {}
  const latency = summary.latency ?? {}
  const func = summary.functional

  const tagMax = Math.max(
    1,
    ...['category_accuracy', 'color_accuracy', 'style_accuracy', 'end_to_end_tagging_success'].map((k) =>
      Number(tagging[k] ?? 0),
    ),
  )
  const recMax = Math.max(
    1,
    ...['full', 'no_reference', 'random'].flatMap((c) => [
      Number(conds[c]?.overall_mean ?? 0),
      Number(conds[c]?.venue_fit_mean ?? 0),
    ]),
  )
  const latMax = Math.max(
    1,
    ...Object.values(latency).flatMap((m) => [Number(m.median_ms ?? 0), Number(m.p95_ms ?? 0)]),
  )

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-ink">Evaluation</h1>
        <p className="text-xs text-muted">
          Read-only summary of the reproducible evaluation pipeline
          {summary.generated_at ? ` — generated ${summary.generated_at}` : ''}
          {summary.git_revision ? ` · git ${summary.git_revision.slice(0, 7)}` : ''}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          This is a <span className="font-medium text-ink">static snapshot</span>, not live telemetry. It only
          changes when you re-run <code>evaluation/scripts/analyze.py</code> — normal use of the app
          (uploading, recommending, trying on) does not update these numbers.
        </p>
        {runButton}
      </div>

      <Card
        title="Upload screening and tagging"
        hint="How to read: acceptance/rejection rates tell you how well the screen catches non-clothing, multi-item, and model-worn photos. Category/color/style accuracy (over accepted photos only) measures tagging quality. End-to-end tagging success is the honest headline number — a valid photo that gets wrongly rejected still counts against it."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-ink">Tagging accuracy (VLM)</p>
            <Bar label="Category" value={Number(tagging.category_accuracy ?? 0)} max={tagMax} />
            <Bar label="Color" value={Number(tagging.color_accuracy ?? 0)} max={tagMax} />
            <Bar label="Style" value={Number(tagging.style_accuracy ?? 0)} max={tagMax} />
            <Bar label="End-to-end" value={Number(tagging.end_to_end_tagging_success ?? 0)} max={tagMax} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-ink">Screening</p>
            <MetricTable
              rows={[
                ['Metric', 'Value'],
                ['Valid acceptance', screening.valid_acceptance_rate],
                ['False rejection', screening.false_rejection_rate],
                ['False acceptance', screening.false_acceptance_rate],
              ]}
            />
            <p className="mt-2 text-xs text-muted">
              Confusion: TP {fmt(cm.tp)}, FN {fmt(cm.fn)}, FP {fmt(cm.fp)}, TN {fmt(cm.tn)}
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="Recommendation ablation"
        hint="How to read: overall score (0–1) is the system's internal ranking, so compare conditions rather than trusting the absolute value. If full beats no-reference more often and by more, the retailer-reference styling adds value; if it ties, the venue/cohesion rules are doing the work. Complete rate = share of cases with a full top+bottom (or dress) outfit; fallback rate = share of best-effort returns."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-ink">Overall score by condition</p>
            {['full', 'no_reference', 'random'].map((c) => (
              <Bar key={c} label={c} value={Number(conds[c]?.overall_mean ?? 0)} max={recMax} />
            ))}
          </div>
          <MetricTable
            rows={[
              ['Condition', 'Cases', 'Overall', 'Complete', 'Fallback'],
              ...['full', 'no_reference', 'random'].map((c) => [
                c,
                conds[c]?.cases ?? 0,
                conds[c]?.overall_mean,
                conds[c]?.complete_rate,
                conds[c]?.fallback_rate,
              ]),
            ]}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          Full vs no-reference: win/tie/loss {fmt(summary.recommend?.full_vs_no_reference?.wins)}/
          {fmt(summary.recommend?.full_vs_no_reference?.ties)}/
          {fmt(summary.recommend?.full_vs_no_reference?.losses)} · Full vs random:{' '}
          {fmt(summary.recommend?.full_vs_random?.wins)}/
          {fmt(summary.recommend?.full_vs_random?.ties)}/
          {fmt(summary.recommend?.full_vs_random?.losses)}
        </p>
      </Card>

      <Card
        title="Latency"
        hint="How to read: median is the typical wait; p95 is the wait in the slowest 5% of runs — that's what you'll feel during a live demo. The ≤20 s rate is the share of successful upload-to-recommend runs that finish within the 20-second target (want ≥0.95). A large gap between median and p95 means occasional slow runs, usually an external API tail."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            {Object.entries(latency).map(([scenario, m]) => (
              <div key={scenario} className="mb-2">
                <p className="mb-1 text-xs font-medium text-ink">{scenario}</p>
                <Bar label="median ms" value={Number(m.median_ms ?? 0)} max={latMax} />
                <Bar label="p95 ms" value={Number(m.p95_ms ?? 0)} max={latMax} />
              </div>
            ))}
          </div>
          <MetricTable
            rows={[
              ['Scenario', 'Count', 'Median', 'p95', '≤20 s'],
              ...Object.entries(latency).map(([scenario, m]) => [
                scenario,
                m.count,
                m.median_ms,
                m.p95_ms,
                m.within_20s_rate,
              ]),
            ]}
          />
        </div>
      </Card>

      <Card
        title="Functional reliability"
        hint="How to read: pass rate is the share of defined user-flow scenarios that behaved as expected (aim ≥0.9). Each row compares the expected HTTP status with the actual one; SKIP means the scenario could not be exercised in this environment (e.g. no body photo, or DeepSeek configured)."
      >
        <p className="mb-2 text-xs text-muted">
          Pass rate {fmt(func?.pass_rate)} ({fmt(func?.passed)} passed, {fmt(func?.failed)} failed,{' '}
          {fmt(func?.skipped)} skipped)
        </p>
        <MetricTable
          rows={[
            ['Case', 'Expected', 'Actual', 'Result'],
            ...(func?.cases ?? []).map((c) => [
              `${c.case_id} — ${c.description}`,
              c.expected_status,
              c.actual_status,
              c.passed === true ? 'PASS' : c.passed === false ? 'FAIL' : 'SKIP',
            ]),
          ]}
        />
      </Card>

      <DatasetCard />
    </div>
  )
}
