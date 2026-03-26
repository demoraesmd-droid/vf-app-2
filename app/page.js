'use client'
import { useState, useCallback, useRef } from 'react'

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = () => rej(new Error('Read failed'))
    r.readAsDataURL(file)
  })
}

function generateExcel(results) {
  const XLSX = window.XLSX
  const wb = XLSX.utils.book_new()
  results.forEach((result, idx) => {
    const data = result.data
    const pi = data.patient_info || {}, gi = data.global_indices || {}
    const sheetName = (`${pi.eye || ''} ${pi.test_type || ''}`.trim() || `Result ${idx + 1}`).substring(0, 31)
    const rows = [['HUMPHREY VISUAL FIELD ANALYSIS'], [], ['PATIENT INFORMATION']]
    ;[['Patient Name', pi.name], ['Patient ID', pi.id], ['Date of Birth', pi.date_of_birth],
      ['Test Date', pi.test_date], ['Eye', pi.eye], ['Test Type', pi.test_type],
      ['Visual Acuity', pi.visual_acuity], ['Pupil Diameter', pi.pupil_diameter],
      ['Rx Used', pi.rx_used], ['Stimulus', pi.stimulus], ['Background', pi.background],
      ['Strategy', pi.strategy], ['Test Duration', pi.test_duration],
      ['Foveal Threshold', pi.foveal_threshold], ['Fixation Losses', pi.fixation_losses],
      ['False Pos Errors', pi.false_pos_errors], ['False Neg Errors', pi.false_neg_errors],
    ].forEach(([k, v]) => { if (v) rows.push([k, v]) })
    rows.push([], ['GLOBAL INDICES'])
    ;[['MD (Mean Deviation)', gi.MD, 'p', gi.MD_p], ['PSD (Pattern Std Dev)', gi.PSD, 'p', gi.PSD_p],
      ['VFI (Visual Field Index)', gi.VFI], ['GHT (Glaucoma Hemifield Test)', gi.GHT],
    ].forEach(([label, val, pl, pv]) => {
      if (val) { const r = [label, val]; if (pl && pv) r.push(pl, pv); rows.push(r) }
    })
    rows.push([])
    const addGrid = (title, points) => {
      if (!points?.length) return
      rows.push([title])
      const maxX = Math.max(...points.map(p => p.x))
      const maxY = Math.max(...points.map(p => p.y))
      const grid = {}
      points.forEach(p => { grid[`${p.y},${p.x}`] = p.value ?? '' })
      rows.push(['Y\\X', ...Array.from({ length: maxX }, (_, i) => i + 1)])
      for (let y = 1; y <= maxY; y++) {
        const row = [y, ...Array.from({ length: maxX }, (_, x) => grid[`${y},${x + 1}`] ?? '')]
        if (row.slice(1).some(v => v !== '')) rows.push(row)
      }
      rows.push([])
    }
    addGrid('THRESHOLD VALUES (dB)', data.threshold_values)
    addGrid('TOTAL DEVIATION', data.total_deviation)
    addGrid('PATTERN DEVIATION', data.pattern_deviation)
    if (data.threshold_values?.length) {
      rows.push(['ALL THRESHOLD POINTS (Raw)'], ['X', 'Y', 'Threshold (dB)', 'Total Dev', 'Pattern Dev'])
      const tdMap = {}, pdMap = {}
      ;(data.total_deviation || []).forEach(p => { tdMap[`${p.x},${p.y}`] = p.value })
      ;(data.pattern_deviation || []).forEach(p => { pdMap[`${p.x},${p.y}`] = p.value })
      data.threshold_values.forEach(p => rows.push([p.x, p.y, p.value ?? '', tdMap[`${p.x},${p.y}`] ?? '', pdMap[`${p.x},${p.y}`] ?? '']))
    }
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  })
  if (results.length > 1) {
    const sumRows = [['SUMMARY'], ['Image', 'Eye', 'Test Type', 'Date', 'MD', 'PSD', 'VFI', 'GHT', 'Points']]
    results.forEach(r => {
      const pi = r.data.patient_info || {}, gi = r.data.global_indices || {}
      sumRows.push([r.filename, pi.eye, pi.test_type, pi.test_date, gi.MD, gi.PSD, gi.VFI, gi.GHT, r.data.threshold_values?.length || 0])
    })
    const ws = XLSX.utils.aoa_to_sheet(sumRows)
    ws['!cols'] = Array(9).fill({ wch: 18 })
    XLSX.utils.book_append_sheet(wb, ws, 'Summary')
  }
  XLSX.writeFile(wb, `visual_field_export_${Date.now()}.xlsx`)
}

function ThresholdGrid({ points }) {
  if (!points?.length) return null
  const maxX = Math.max(...points.map(p => p.x || 0))
  const maxY = Math.max(...points.map(p => p.y || 0))
  const grid = {}
  let minV = Infinity, maxV = -Infinity
  points.forEach(p => {
    if (p.x && p.y && p.value != null) {
      grid[`${p.y},${p.x}`] = p.value
      if (typeof p.value === 'number') { minV = Math.min(minV, p.value); maxV = Math.max(maxV, p.value) }
    }
  })
  const getColor = v => {
    if (v == null || typeof v !== 'number') return '#e2e8f0'
    const n = Math.max(0, Math.min(1, (v - minV) / (maxV - minV || 1)))
    return `rgb(${Math.round(14 + 211 * n)},${Math.round(158 + 97 * n)},${Math.round(117 + 138 * n)})`
  }
  return (
    <div className="overflow-x-auto mt-3">
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {Array.from({ length: maxY }, (_, yi) => (
            <tr key={yi}>
              {Array.from({ length: maxX }, (_, xi) => {
                const val = grid[`${yi + 1},${xi + 1}`]
                return <td key={xi} style={{ width: 26, height: 22, textAlign: 'center', verticalAlign: 'middle', background: getColor(val), borderRadius: 2, border: '1px solid rgba(255,255,255,0.5)', color: val != null ? '#1a1a1a' : 'transparent', fontSize: 9, fontFamily: 'monospace' }}>{val != null ? val : ''}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ResultCard({ result }) {
  const [expanded, setExpanded] = useState(false)
  const isError = !!result.error
  const pi = result.data?.patient_info || {}
  const gi = result.data?.global_indices || {}
  const points = result.data?.threshold_values?.length || 0
  return (
    <div className={`rounded-xl border overflow-hidden ${isError ? 'border-red-300 bg-red-50' : 'border-teal-600 bg-white'}`}>
      <div className="px-4 py-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold mb-1 truncate">{isError ? '❌' : '✅'} {result.filename}</p>
          {isError
            ? <p className="text-xs text-red-700">{result.error}</p>
            : <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                {pi.eye && <span><b>Eye:</b> {pi.eye}</span>}
                {pi.test_type && <span><b>Type:</b> {pi.test_type}</span>}
                {pi.test_date && <span><b>Date:</b> {pi.test_date}</span>}
                {gi.MD && <span><b>MD:</b> {gi.MD}{gi.MD_p && ` (p${gi.MD_p})`}</span>}
                {gi.VFI && <span><b>VFI:</b> {gi.VFI}</span>}
                <span><b>Points:</b> {points}</span>
              </div>}
        </div>
        {!isError && <button onClick={() => setExpanded(e => !e)} className="shrink-0 text-xs border border-teal-600 text-teal-700 rounded-md px-3 py-1 hover:bg-teal-50">{expanded ? 'Hide' : 'Preview'}</button>}
      </div>
      {expanded && !isError && (
        <div className="border-t border-teal-200 bg-teal-50 px-4 py-4">
          <div className="grid grid-cols-2 gap-6 mb-4">
            <div>
              <p className="text-xs font-bold text-teal-800 uppercase tracking-wide mb-2">Patient Info</p>
              <table className="text-xs w-full"><tbody>
                {[['Name', pi.name], ['ID', pi.id], ['DOB', pi.date_of_birth], ['VA', pi.visual_acuity], ['Pupil', pi.pupil_diameter], ['Rx', pi.rx_used], ['Strategy', pi.strategy], ['Duration', pi.test_duration], ['Fix. Losses', pi.fixation_losses], ['False Pos', pi.false_pos_errors], ['False Neg', pi.false_neg_errors]].filter(([, v]) => v).map(([k, v]) => (
                  <tr key={k}><td className="text-slate-500 pr-3 py-0.5 whitespace-nowrap">{k}</td><td className="font-medium">{v}</td></tr>
                ))}
              </tbody></table>
            </div>
            <div>
              <p className="text-xs font-bold text-teal-800 uppercase tracking-wide mb-2">Global Indices</p>
              <table className="text-xs w-full"><tbody>
                {[['MD', gi.MD ? `${gi.MD} (p${gi.MD_p || '?'})` : ''], ['PSD', gi.PSD ? `${gi.PSD} (p${gi.PSD_p || '?'})` : ''], ['VFI', gi.VFI], ['GHT', gi.GHT]].filter(([, v]) => v).map(([k, v]) => (
                  <tr key={k}><td className="text-slate-500 pr-3 py-0.5">{k}</td><td className="font-medium text-red-700">{v}</td></tr>
                ))}
              </tbody></table>
            </div>
          </div>
          {result.data.threshold_values?.length > 0 && <>
            <p className="text-xs font-bold text-teal-800 uppercase tracking-wide mb-1">Threshold Grid ({points} points)</p>
            <ThresholdGrid points={result.data.threshold_values} />
          </>}
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [files, setFiles] = useState([])
  const [results, setResults] = useState([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' })
  const [error, setError] = useState('')
  const fileInputRef = useRef()
  const xlsxLoaded = useRef(false)

  const loadXLSX = () => new Promise(res => {
    if (xlsxLoaded.current) return res()
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => { xlsxLoaded.current = true; res() }
    document.head.appendChild(s)
  })

  const onDrop = useCallback(e => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer?.files || e.target.files || []).filter(f => f.type.startsWith('image/') || f.name.match(/\.(jpg|jpeg|png)$/i))
    setFiles(prev => { const names = new Set(prev.map(f => f.name)); return [...prev, ...dropped.filter(f => !names.has(f.name))] })
  }, [])

  const processAll = async () => {
    if (!files.length) return
    setProcessing(true); setResults([]); setError('')
    await loadXLSX()
    const newResults = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProgress({ current: i + 1, total: files.length, status: `Analyzing ${file.name}…` })
      try {
        const base64 = await toBase64(file)
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type || 'image/jpeg' })
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || `Server error ${res.status}`)
        newResults.push({ filename: file.name, data: json.data })
      } catch (err) {
        newResults.push({ filename: file.name, error: err.message, data: {} })
      }
    }
    setResults(newResults)
    setProcessing(false)
    setProgress({ current: 0, total: 0, status: '' })
  }

  const downloadExcel = async () => {
    await loadXLSX()
    const valid = results.filter(r => !r.error && r.data.patient_info)
    if (!valid.length) { setError('No valid results to export.'); return }
    generateExcel(valid)
  }

  const successCount = results.filter(r => !r.error && r.data.patient_info).length
  const errorCount = results.filter(r => r.error).length

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800">Visual Field Extractor</h1>
            <span className="text-xs font-mono bg-teal-100 text-teal-800 border border-teal-300 px-2 py-0.5 rounded-full">24-2 · 10-2</span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">Upload Humphrey Visual Field images → extract all data → download Excel</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        <div onDrop={onDrop} onDragOver={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${files.length ? 'border-teal-500 bg-teal-50' : 'border-slate-300 bg-white hover:border-teal-400 hover:bg-teal-50'}`}>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" multiple onChange={onDrop} className="hidden" />
          <div className="text-4xl mb-3">📁</div>
          <p className="font-semibold text-slate-700">Drop images here or click to browse</p>
          <p className="text-sm text-slate-400 mt-1">JPEG or PNG · 24-2 and 10-2 Humphrey VF reports</p>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{files.length} file{files.length > 1 ? 's' : ''} queued</p>
            {files.map(f => (
              <div key={f.name} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                <span className="font-mono text-sm text-slate-700 truncate">{f.name}</span>
                <div className="flex items-center gap-3 ml-3 shrink-0">
                  <span className="text-xs text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => setFiles(p => p.filter(x => x.name !== f.name))} className="text-slate-400 hover:text-red-500 text-lg leading-none">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button onClick={processAll} disabled={!files.length || processing}
            className={`px-5 py-2.5 rounded-lg font-semibold text-sm text-white transition-colors ${files.length && !processing ? 'bg-teal-600 hover:bg-teal-700' : 'bg-slate-300 cursor-not-allowed'}`}>
            {processing ? `Processing ${progress.current}/${progress.total}…` : `Extract Data (${files.length} file${files.length !== 1 ? 's' : ''})`}
          </button>
          {successCount > 0 && (
            <button onClick={downloadExcel} className="px-5 py-2.5 rounded-lg font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors">
              ⬇ Download Excel ({successCount} sheet{successCount !== 1 ? 's' : ''})
            </button>
          )}
          {files.length > 0 && (
            <button onClick={() => { setFiles([]); setResults([]); setError('') }} className="px-4 py-2.5 rounded-lg font-semibold text-sm text-slate-500 border border-slate-300 hover:bg-slate-100 transition-colors">
              Clear all
            </button>
          )}
        </div>

        {processing && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
            <p className="text-sm text-teal-800 mb-2">{progress.status}</p>
            <div className="bg-white rounded-full h-2 overflow-hidden">
              <div className="bg-teal-500 h-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
            </div>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3 text-sm text-red-800">{error}</div>}

        {results.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Results — {successCount} extracted, {errorCount} failed</p>
            <div className="space-y-3">{results.map((r, i) => <ResultCard key={i} result={r} />)}</div>
          </div>
        )}

        <p className="text-xs text-center text-slate-400 pt-4">Powered by Claude AI · Data processed securely and not stored</p>
      </main>
    </div>
  )
}
