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
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
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
    <div style={{ border: `1px solid ${isError ? '#fca5a5' : '#0f6e56'}`, borderRadius: 12, overflow: 'hidden', background: isError ? '#fef2f2' : 'white', marginBottom: 12 }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, marginBottom: 4, margin: '0 0 4px' }}>{isError ? '❌' : '✅'} {result.filename}</p>
          {isError
            ? <p style={{ fontSize: 12, color: '#b91c1c', margin: 0 }}>{result.error}</p>
            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#64748b' }}>
                {pi.eye && <span><b>Eye:</b> {pi.eye}</span>}
                {pi.test_type && <span><b>Type:</b> {pi.test_type}</span>}
                {pi.test_date && <span><b>Date:</b> {pi.test_date}</span>}
                {gi.MD && <span><b>MD:</b> {gi.MD}{gi.MD_p && ` (p${gi.MD_p})`}</span>}
                {gi.VFI && <span><b>VFI:</b> {gi.VFI}</span>}
                <span><b>Points:</b> {points}</span>
              </div>}
        </div>
        {!isError && <button onClick={() => setExpanded(e => !e)} style={{ flexShrink: 0, fontSize: 12, border: '1px solid #0f6e56', color: '#085041', background: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>{expanded ? 'Hide' : 'Preview'}</button>}
      </div>
      {expanded && !isError && (
        <div style={{ borderTop: '1px solid #99f6e4', background: '#f0fdf9', padding: '14px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, margin: '0 0 8px' }}>Patient Info</p>
              <table style={{ fontSize: 12, width: '100%' }}><tbody>
                {[['Name', pi.name], ['ID', pi.id], ['DOB', pi.date_of_birth], ['VA', pi.visual_acuity], ['Pupil', pi.pupil_diameter], ['Rx', pi.rx_used], ['Strategy', pi.strategy], ['Duration', pi.test_duration], ['Fix. Losses', pi.fixation_losses], ['False Pos', pi.false_pos_errors], ['False Neg', pi.false_neg_errors]].filter(([, v]) => v).map(([k, v]) => (
                  <tr key={k}><td style={{ color: '#94a3b8', paddingRight: 8, paddingBottom: 2, whiteSpace: 'nowrap' }}>{k}</td><td style={{ fontWeight: 500 }}>{v}</td></tr>
                ))}
              </tbody></table>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, margin: '0 0 8px' }}>Global Indices</p>
              <table style={{ fontSize: 12, width: '100%' }}><tbody>
                {[['MD', gi.MD ? `${gi.MD} (p${gi.MD_p || '?'})` : ''], ['PSD', gi.PSD ? `${gi.PSD} (p${gi.PSD_p || '?'})` : ''], ['VFI', gi.VFI], ['GHT', gi.GHT]].filter(([, v]) => v).map(([k, v]) => (
                  <tr key={k}><td style={{ color: '#94a3b8', paddingRight: 8, paddingBottom: 2 }}>{k}</td><td style={{ fontWeight: 500, color: '#b91c1c' }}>{v}</td></tr>
                ))}
              </tbody></table>
            </div>
          </div>
          {result.data.threshold_values?.length > 0 && <>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Threshold Grid ({points} points)</p>
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

  const S = {
    wrap: { minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' },
    header: { background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 24px' },
    headerInner: { maxWidth: 720, margin: '0 auto' },
    title: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 },
    h1: { fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 },
    badge: { fontSize: 12, fontFamily: 'monospace', background: '#ccfbf1', color: '#065f46', border: '1px solid #6ee7b7', padding: '2px 10px', borderRadius: 20 },
    subtitle: { fontSize: 14, color: '#64748b', margin: 0 },
    main: { maxWidth: 720, margin: '0 auto', padding: '32px 24px' },
    dropzone: (active) => ({ border: `2px dashed ${active ? '#10b981' : '#cbd5e1'}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center', cursor: 'pointer', background: active ? '#f0fdf9' : 'white', transition: 'all 0.2s', marginBottom: 20 }),
    dropIcon: { fontSize: 40, marginBottom: 12 },
    dropTitle: { fontSize: 16, fontWeight: 600, color: '#334155', margin: '0 0 4px' },
    dropSub: { fontSize: 13, color: '#94a3b8', margin: 0 },
    fileRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', marginBottom: 6 },
    btnPrimary: (disabled) => ({ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, color: 'white', background: disabled ? '#94a3b8' : '#0f6e56', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }),
    btnBlue: { padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, color: 'white', background: '#2563eb', border: 'none', cursor: 'pointer' },
    btnGhost: { padding: '10px 16px', borderRadius: 8, fontWeight: 600, fontSize: 14, color: '#64748b', background: 'none', border: '1px solid #cbd5e1', cursor: 'pointer' },
    progress: { background: '#f0fdf9', border: '1px solid #6ee7b7', borderRadius: 8, padding: '12px 16px', marginBottom: 16 },
    progressBar: { background: 'white', borderRadius: 4, height: 6, overflow: 'hidden', marginTop: 8 },
    progressFill: (pct) => ({ width: `${pct}%`, background: '#10b981', height: '100%', transition: 'width 0.3s' }),
    error: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 16 },
    sectionLabel: { fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 },
    footer: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 32 },
  }

  return (
    <div style={S.wrap}>
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={S.title}>
            <h1 style={S.h1}>Visual Field Extractor</h1>
            <span style={S.badge}>24-2 · 10-2</span>
          </div>
          <p style={S.subtitle}>Upload Humphrey Visual Field images → extract all data → download Excel</p>
        </div>
      </header>

      <main style={S.main}>
        <div style={S.dropzone(files.length > 0)} onDrop={onDrop} onDragOver={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" multiple onChange={onDrop} style={{ display: 'none' }} />
          <div style={S.dropIcon}>📁</div>
          <p style={S.dropTitle}>Drop images here or click to browse</p>
          <p style={S.dropSub}>JPEG or PNG · 24-2 and 10-2 Humphrey VF reports</p>
        </div>

        {files.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={S.sectionLabel}>{files.length} file{files.length > 1 ? 's' : ''} queued</p>
            {files.map(f => (
              <div key={f.name} style={S.fileRow}>
                <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#334155' }}>{f.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{(f.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => setFiles(p => p.filter(x => x.name !== f.name))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, lineHeight: 1, padding: 0 }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          <button onClick={processAll} disabled={!files.length || processing} style={S.btnPrimary(!files.length || processing)}>
            {processing ? `Processing ${progress.current}/${progress.total}…` : `Extract Data (${files.length} file${files.length !== 1 ? 's' : ''})`}
          </button>
          {successCount > 0 && <button onClick={downloadExcel} style={S.btnBlue}>⬇ Download Excel ({successCount} sheet{successCount !== 1 ? 's' : ''})</button>}
          {files.length > 0 && <button onClick={() => { setFiles([]); setResults([]); setError('') }} style={S.btnGhost}>Clear all</button>}
        </div>

        {processing && (
          <div style={S.progress}>
            <p style={{ fontSize: 13, color: '#065f46', margin: 0 }}>{progress.status}</p>
            <div style={S.progressBar}><div style={S.progressFill((progress.current / progress.total) * 100)} /></div>
          </div>
        )}

        {error && <div style={S.error}>{error}</div>}

        {results.length > 0 && (
          <div>
            <p style={S.sectionLabel}>Results — {successCount} extracted, {errorCount} failed</p>
            {results.map((r, i) => <ResultCard key={i} result={r} />)}
          </div>
        )}

        <p style={S.footer}>Powered by Claude AI · Data processed securely and not stored</p>
      </main>
    </div>
  )
}
