/**
 * ClinicalAnglesView.jsx
 *
 * Real-time joint angle display styled after Vicon Polygon / C-Motion Visual3D /
 * OrthoTrak clinical gait analysis reports.
 *
 * Layout
 * ──────
 * Rows  = body segments (Pelvis · Lumbar · Trunk · Hip · Knee · Ankle ·
 *                         Shoulder · Elbow)
 * Cols  = kinematic planes (Sagittal · Frontal · Transverse)
 * Each cell: label + current value + normative band + Recharts time-series
 *
 * Colour convention (clinical standard)
 * ──────────────────────────────────────
 *   Left  = red   (#ef4444)
 *   Right = blue  (#3b82f6)
 *   Axial / trunk = green (#22c55e)
 */

import { useMemo, useState } from 'react'
import {
  LineChart, Line, ReferenceLine, ReferenceArea,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'

// ── Normative range database ──────────────────────────────────────────────────
// [min, max] degrees — walking gait normals (Perry 1992 + Winter 2009)
const NORMS = {
  pelvis_forward_lean:        [ 8,  18],
  pelvis_lateral_lean:        [-5,   5],
  pelvis_rotation:            [-8,   8],
  lumbar_flexion:             [-5,  15],
  lumbar_lateral:             [-5,   5],
  lumbar_rotation:            [-8,   8],
  trunk_forward_lean:         [ 0,  15],
  trunk_lateral_lean:         [-5,   5],
  trunk_rotation:             [-8,   8],
  left_hip_flexion:           [-10,  40],
  right_hip_flexion:          [-10,  40],
  left_hip_abduction:         [-10,  10],
  right_hip_abduction:        [-10,  10],
  left_hip_rotation:          [-15,  15],
  right_hip_rotation:         [-15,  15],
  left_knee_flexion:          [ 0,  70],
  right_knee_flexion:         [ 0,  70],
  left_knee_valgus:           [-6,   6],
  right_knee_valgus:          [-6,   6],
  left_ankle_dorsiflexion:    [-20,  15],
  right_ankle_dorsiflexion:   [-20,  15],
  left_ankle_eversion:        [ -5,  10],
  right_ankle_eversion:       [ -5,  10],
  left_shoulder_flexion:      [-20,  30],
  right_shoulder_flexion:     [-20,  30],
  left_shoulder_abduction:    [  0,  20],
  right_shoulder_abduction:   [  0,  20],
  left_shoulder_rotation:     [-20,  20],
  right_shoulder_rotation:    [-20,  20],
  left_elbow_flexion:         [  0,  90],
  right_elbow_flexion:        [  0,  90],
}

// ── Layout definition ─────────────────────────────────────────────────────────
// Each segment row → up to 3 plane columns
const SEGMENTS = [
  {
    id: 'pelvis', label: 'Pelvis', type: 'axial',
    planes: [
      { id: 'sag', label: 'Sagittal',    key: 'pelvis_forward_lean', posLabel: 'Ant Tilt',  negLabel: 'Post Tilt' },
      { id: 'fro', label: 'Frontal',     key: 'pelvis_lateral_lean', posLabel: 'Left',       negLabel: 'Right' },
      { id: 'tra', label: 'Transverse',  key: 'pelvis_rotation',     posLabel: 'L Rot',      negLabel: 'R Rot' },
    ],
  },
  {
    id: 'lumbar', label: 'Lumbar', type: 'axial',
    planes: [
      { id: 'sag', label: 'Sagittal',    key: 'lumbar_flexion',   posLabel: 'Flexion',  negLabel: 'Extension' },
      { id: 'fro', label: 'Frontal',     key: 'lumbar_lateral',   posLabel: 'L Bend',   negLabel: 'R Bend' },
      { id: 'tra', label: 'Transverse',  key: 'lumbar_rotation',  posLabel: 'L Rot',    negLabel: 'R Rot' },
    ],
  },
  {
    id: 'trunk', label: 'Trunk', type: 'axial',
    planes: [
      { id: 'sag', label: 'Sagittal',    key: 'trunk_forward_lean', posLabel: 'Fwd Lean', negLabel: 'Bwd' },
      { id: 'fro', label: 'Frontal',     key: 'trunk_lateral_lean', posLabel: 'Left',      negLabel: 'Right' },
      { id: 'tra', label: 'Transverse',  key: 'trunk_rotation',     posLabel: 'L Rot',     negLabel: 'R Rot' },
    ],
  },
  {
    id: 'hip', label: 'Hip', type: 'bilateral',
    planes: [
      { id: 'sag', label: 'Sagittal',    key: '{s}_hip_flexion',    posLabel: 'Flexion',   negLabel: 'Extension' },
      { id: 'fro', label: 'Frontal',     key: '{s}_hip_abduction',  posLabel: 'Abduction', negLabel: 'Adduction' },
      { id: 'tra', label: 'Transverse',  key: '{s}_hip_rotation',   posLabel: 'Int Rot',   negLabel: 'Ext Rot' },
    ],
  },
  {
    id: 'knee', label: 'Knee', type: 'bilateral',
    planes: [
      { id: 'sag', label: 'Sagittal',    key: '{s}_knee_flexion',  posLabel: 'Flexion',  negLabel: 'Extension' },
      { id: 'fro', label: 'Frontal',     key: '{s}_knee_valgus',   posLabel: 'Valgus',   negLabel: 'Varus' },
    ],
  },
  {
    id: 'ankle', label: 'Ankle', type: 'bilateral',
    planes: [
      { id: 'sag', label: 'Sagittal',    key: '{s}_ankle_dorsiflexion', posLabel: 'Dorsi Flex',  negLabel: 'Plantar Flex' },
      { id: 'fro', label: 'Frontal',     key: '{s}_ankle_eversion',     posLabel: 'Eversion',    negLabel: 'Inversion' },
    ],
  },
  {
    id: 'shoulder', label: 'Shoulder', type: 'bilateral',
    planes: [
      { id: 'sag', label: 'Sagittal',    key: '{s}_shoulder_flexion',    posLabel: 'Flexion',    negLabel: 'Extension' },
      { id: 'fro', label: 'Frontal',     key: '{s}_shoulder_abduction',  posLabel: 'Abduction',  negLabel: 'Adduction' },
      { id: 'tra', label: 'Transverse',  key: '{s}_shoulder_rotation',   posLabel: 'Int Rot',    negLabel: 'Ext Rot' },
    ],
  },
  {
    id: 'elbow', label: 'Elbow', type: 'bilateral',
    planes: [
      { id: 'sag', label: 'Sagittal',    key: '{s}_elbow_flexion',  posLabel: 'Flexion',  negLabel: 'Extension' },
    ],
  },
]

const LEFT_COLOR  = '#ef4444'   // red
const RIGHT_COLOR = '#3b82f6'   // blue
const AXIAL_COLOR = '#22c55e'   // green

const HISTORY_LEN = 120   // frames kept in the ring buffer

// ── Tiny sparkline ────────────────────────────────────────────────────────────
function Sparkline({ data, color, yMin, yMax, normMin, normMax }) {
  if (!data || data.length === 0) return (
    <div className="w-full h-16 flex items-center justify-center text-gray-600 text-xs">no data</div>
  )
  const chartData = data.map((v, i) => ({ i, v }))
  const padding = Math.max(10, (yMax - yMin) * 0.15)
  const domainMin = yMin - padding
  const domainMax = yMax + padding

  return (
    <ResponsiveContainer width="100%" height={68}>
      <LineChart data={chartData} margin={{ top: 4, right: 2, bottom: 2, left: 0 }}>
        {/* Normative band */}
        {normMin !== undefined && normMax !== undefined && (
          <ReferenceArea y1={normMin} y2={normMax}
            fill="#ffffff" fillOpacity={0.06} strokeOpacity={0} />
        )}
        <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="3 3" strokeWidth={1} />
        <XAxis dataKey="i" hide />
        <YAxis domain={[domainMin, domainMax]} hide />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 4, padding: '2px 8px' }}
          labelFormatter={() => ''}
          formatter={(v) => [`${v.toFixed(1)}°`, '']}
        />
        <Line
          type="monotone" dataKey="v"
          stroke={color} strokeWidth={2}
          dot={false} isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Single angle cell (one plane, one side) ───────────────────────────────────
function AngleCell({ angleKey, history, posLabel, negLabel, color }) {
  const hist    = history[angleKey] ?? []
  const current = hist.length > 0 ? hist[hist.length - 1] : null
  const norm    = NORMS[angleKey] ?? null
  const isAbove = norm && current !== null && current > norm[1]
  const isBelow = norm && current !== null && current < norm[0]
  const alert   = isAbove || isBelow

  // y-axis range: normative range ± 40 %
  const ySpan   = norm ? (norm[1] - norm[0]) : 60
  const yMid    = norm ? (norm[0] + norm[1]) / 2 : 0
  const yMin    = yMid - ySpan * 1.4
  const yMax    = yMid + ySpan * 1.4

  return (
    <div className={`rounded p-2 border ${alert ? 'border-red-600 bg-red-950/30' : 'border-gray-700 bg-gray-900'}`}>
      {/* Value row */}
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-gray-500 text-xs font-mono truncate max-w-[60%]">
          {posLabel} / {negLabel}
        </span>
        <span className={`text-sm font-bold font-mono tabular-nums ${alert ? 'text-red-400' : ''}`}
              style={{ color: alert ? undefined : color }}>
          {current !== null ? `${current > 0 ? '+' : ''}${current.toFixed(1)}°` : '—'}
        </span>
      </div>
      {/* Normative bar */}
      {norm && current !== null && (
        <div className="relative h-1.5 bg-gray-800 rounded mb-1">
          {/* Normative band highlight */}
          <div className="absolute h-full rounded bg-white/10"
            style={{
              left: `${Math.max(0, (norm[0] - yMin) / (yMax - yMin) * 100)}%`,
              width: `${Math.min(100, (norm[1] - norm[0]) / (yMax - yMin) * 100)}%`,
            }} />
          {/* Current value indicator */}
          <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-gray-900"
            style={{
              left:  `${Math.min(98, Math.max(1, (current - yMin) / (yMax - yMin) * 100))}%`,
              background: color,
            }} />
        </div>
      )}
      {/* Sparkline */}
      <Sparkline
        data={hist}
        color={color}
        yMin={yMin} yMax={yMax}
        normMin={norm?.[0]} normMax={norm?.[1]}
      />
    </div>
  )
}

// ── One plane column (bilateral: left + right stacked) ────────────────────────
function PlaneCol({ plane, type, history, open }) {
  if (!open) return null
  const lKey = plane.key.replace('{s}', 'left')
  const rKey = plane.key.replace('{s}', 'right')

  if (type === 'bilateral') {
    return (
      <div className="flex flex-col gap-1 min-w-0">
        <AngleCell angleKey={lKey} history={history}
          posLabel={plane.posLabel} negLabel={plane.negLabel}
          color={LEFT_COLOR} />
        <AngleCell angleKey={rKey} history={history}
          posLabel={plane.posLabel} negLabel={plane.negLabel}
          color={RIGHT_COLOR} />
      </div>
    )
  }
  return (
    <AngleCell angleKey={plane.key} history={history}
      posLabel={plane.posLabel} negLabel={plane.negLabel}
      color={AXIAL_COLOR} />
  )
}

// ── Segment row ───────────────────────────────────────────────────────────────
function SegmentRow({ seg, history, openPlanes, togglePlane, expanded, onToggle }) {
  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden mb-2">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-800 hover:bg-gray-750 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-white text-sm">{seg.label}</span>
          {seg.type === 'bilateral' && (
            <div className="flex gap-2 text-xs">
              <span style={{ color: LEFT_COLOR }}>■ L</span>
              <span style={{ color: RIGHT_COLOR }}>■ R</span>
            </div>
          )}
          {seg.type === 'axial' && (
            <span className="text-xs" style={{ color: AXIAL_COLOR }}>■ Global</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Live value badges (sagittal only, bilateral) */}
          {seg.planes.slice(0, 1).map(p => {
            const lKey = p.key.replace('{s}', 'left')
            const rKey = p.key.replace('{s}', 'right')
            const axKey = p.key
            if (seg.type === 'bilateral') {
              const lv = history[lKey]?.at(-1)
              const rv = history[rKey]?.at(-1)
              return (
                <div key={p.id} className="flex gap-2 text-xs font-mono">
                  {lv !== undefined && <span style={{ color: LEFT_COLOR }}>{lv > 0 ? '+' : ''}{lv.toFixed(0)}°</span>}
                  {rv !== undefined && <span style={{ color: RIGHT_COLOR }}>{rv > 0 ? '+' : ''}{rv.toFixed(0)}°</span>}
                </div>
              )
            }
            const v = history[axKey]?.at(-1)
            return v !== undefined
              ? <span key={p.id} className="text-xs font-mono" style={{ color: AXIAL_COLOR }}>{v > 0 ? '+' : ''}{v.toFixed(0)}°</span>
              : null
          })}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="p-3 bg-gray-900">
          {/* Plane toggles */}
          <div className="flex gap-2 mb-3">
            {seg.planes.map(p => (
              <button key={p.id}
                onClick={() => togglePlane(seg.id, p.id)}
                className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                  openPlanes[seg.id]?.[p.id]
                    ? 'bg-gray-700 border-gray-500 text-white'
                    : 'bg-transparent border-gray-700 text-gray-500 hover:text-gray-300'
                }`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Plane columns */}
          <div className={`grid gap-3 ${seg.planes.filter(p => openPlanes[seg.id]?.[p.id]).length === 3 ? 'grid-cols-3' : seg.planes.filter(p => openPlanes[seg.id]?.[p.id]).length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {seg.planes.map(p => (
              <PlaneCol key={p.id} plane={p} type={seg.type}
                history={history} open={openPlanes[seg.id]?.[p.id] ?? false} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function ClinicalAnglesView({ jointAngles, angleHistory }) {
  // Which segments are expanded
  const [expanded, setExpanded] = useState(() => {
    const init = {}
    SEGMENTS.forEach(s => { init[s.id] = s.id === 'hip' || s.id === 'knee' || s.id === 'ankle' })
    return init
  })

  // Which planes are visible per segment (default: sagittal ON, others OFF)
  const [openPlanes, setOpenPlanes] = useState(() => {
    const init = {}
    SEGMENTS.forEach(s => {
      init[s.id] = {}
      s.planes.forEach((p, i) => { init[s.id][p.id] = i === 0 })  // sagittal on
    })
    return init
  })

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  const togglePlane  = (segId, planeId) =>
    setOpenPlanes(prev => ({
      ...prev,
      [segId]: { ...prev[segId], [planeId]: !prev[segId]?.[planeId] }
    }))

  // Derive history map from props; fall back to empty arrays
  const history = useMemo(() => {
    const h = {}
    if (angleHistory) {
      Object.entries(angleHistory).forEach(([k, arr]) => { h[k] = arr })
    }
    return h
  }, [angleHistory])

  const totalAngles = jointAngles ? Object.keys(jointAngles).length : 0

  return (
    <div className="w-full text-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Joint Kinematics</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            ISB convention · Segment CS from virtual landmarks (Bell 1990 HJC)
          </p>
        </div>
        <div className="flex gap-4 text-xs text-gray-400">
          <span>● {totalAngles} angles active</span>
          <div className="flex gap-2">
            <span style={{ color: LEFT_COLOR }}>■ Left</span>
            <span style={{ color: RIGHT_COLOR }}>■ Right</span>
            <span style={{ color: AXIAL_COLOR }}>■ Axial/Global</span>
          </div>
        </div>
      </div>

      {/* Reference note */}
      <div className="mb-4 p-2 rounded bg-gray-800/50 border border-gray-700 text-xs text-gray-400 flex gap-4 flex-wrap">
        <span>📐 Gray band = normative walking range (Perry 1992 · Winter 2009)</span>
        <span>🔴 Alert = outside normative range</span>
        <span>Click a segment to expand · click plane tabs to toggle planes</span>
      </div>

      {/* Segments */}
      {SEGMENTS.map(seg => (
        <SegmentRow
          key={seg.id}
          seg={seg}
          history={history}
          openPlanes={openPlanes}
          togglePlane={togglePlane}
          expanded={expanded[seg.id] ?? false}
          onToggle={() => toggleExpand(seg.id)}
        />
      ))}
    </div>
  )
}