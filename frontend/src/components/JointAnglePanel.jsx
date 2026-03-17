/**
 * JointAnglePanel.jsx
 * Compact quick-reference panel for all computed joint angles.
 * Keys match the new angle_utils.py (ISB segment CS convention).
 */
import { useMemo, useState } from 'react'
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts'

// ── Key mapping: new angle_utils keys → display label ────────────────────────
const BODY_ANGLE_GROUPS = [
  {
    label: 'Trunk / Pelvis', color: '#94a3b8',
    angles: [
      { key: 'trunk_forward_lean',  label: 'Trunk Lean (Sag)' },
      { key: 'trunk_lateral_lean',  label: 'Trunk Lateral' },
      { key: 'trunk_rotation',      label: 'Trunk Rotation' },
      { key: 'pelvis_forward_lean', label: 'Pelvis Tilt (Sag)' },
      { key: 'lumbar_flexion',      label: 'Lumbar Flex' },
    ],
  },
  {
    label: 'Hip', color: '#4ade80',
    angles: [
      { key: 'left_hip_flexion',    label: 'Hip Flex L' },
      { key: 'right_hip_flexion',   label: 'Hip Flex R' },
      { key: 'left_hip_abduction',  label: 'Hip Abd L' },
      { key: 'right_hip_abduction', label: 'Hip Abd R' },
    ],
  },
  {
    label: 'Knee', color: '#facc15',
    angles: [
      { key: 'left_knee_flexion',  label: 'Knee Flex L' },
      { key: 'right_knee_flexion', label: 'Knee Flex R' },
      { key: 'left_knee_valgus',   label: 'Knee Valgus L' },
      { key: 'right_knee_valgus',  label: 'Knee Valgus R' },
    ],
  },
  {
    label: 'Ankle', color: '#f472b6',
    angles: [
      { key: 'left_ankle_dorsiflexion',  label: 'Ankle Dorsi L' },
      { key: 'right_ankle_dorsiflexion', label: 'Ankle Dorsi R' },
      { key: 'left_ankle_eversion',      label: 'Ankle Ever L' },
      { key: 'right_ankle_eversion',     label: 'Ankle Ever R' },
    ],
  },
  {
    label: 'Shoulder', color: '#38bdf8',
    angles: [
      { key: 'left_shoulder_flexion',    label: 'Sh Flex L' },
      { key: 'right_shoulder_flexion',   label: 'Sh Flex R' },
      { key: 'left_shoulder_abduction',  label: 'Sh Abd L' },
      { key: 'right_shoulder_abduction', label: 'Sh Abd R' },
    ],
  },
  {
    label: 'Elbow', color: '#fb923c',
    angles: [
      { key: 'left_elbow_flexion',  label: 'Elbow Flex L' },
      { key: 'right_elbow_flexion', label: 'Elbow Flex R' },
    ],
  },
]

const HAND_FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky']

function Sparkline({ data, color, domain }) {
  const chartData = useMemo(() => (data || []).map((v, i) => ({ i, v })), [data])
  if (!data || data.length < 2) return <div className="h-8 bg-gray-700 rounded opacity-20" />
  const yDomain = domain && domain.length === 2 ? domain : ['auto', 'auto']
  return (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={chartData} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
        <YAxis domain={yDomain} hide />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: 'none', fontSize: 10, padding: '2px 6px' }}
          formatter={v => [`${typeof v === 'number' ? v.toFixed(1) : v}°`, '']}
          labelFormatter={() => ''}
        />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function AngleCard({ angleKey, label, color, value, history }) {
  const hasVal = value != null && !isNaN(value)
  // Fixed Y domains per clinical conventions
  let fixedDomain
  if (angleKey?.endsWith('elbow_flexion')) {
    fixedDomain = [0, 150]
  } else if (angleKey?.endsWith('shoulder_flexion')) {
    fixedDomain = [-45, 180]
  } else if (angleKey?.endsWith('shoulder_abduction')) {
    fixedDomain = [0, 180]
  } else if (angleKey?.endsWith('shoulder_rotation')) {
    fixedDomain = [-70, 90]
  }
  return (
    <div className="bg-gray-900 rounded border border-gray-700 p-2 flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-400 truncate">{label}</span>
        <span className="text-sm font-bold tabular-nums ml-1"
              style={{ color: hasVal ? color : '#4b5563' }}>
          {hasVal ? `${value > 0 ? '+' : ''}${value.toFixed(1)}°` : '—'}
        </span>
      </div>
      <Sparkline data={(history || []).slice(-100)} color={color} domain={fixedDomain} />
    </div>
  )
}

function FingerRow({ side, finger, jointAngles }) {
  const mcpKey = `${side}_${finger}_mcp`
  const pipKey = `${side}_${finger}_pip`
  const mcp = jointAngles[mcpKey]
  const pip = jointAngles[pipKey]
  const color = side === 'left' ? '#4ade80' : '#60a5fa'
  const pctMcp = mcp != null ? Math.max(0, Math.min(100, ((180 - mcp) / 180) * 100)) : 0
  const pctPip = pip != null ? Math.max(0, Math.min(100, ((180 - pip) / 180) * 100)) : 0
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-xs text-gray-500 w-12 capitalize">{finger}</span>
      <div className="flex-1 flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-600 w-6">MCP</span>
          <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pctMcp}%`, background: color }} />
          </div>
          <span className="text-xs tabular-nums w-10 text-right" style={{ color: mcp != null ? color : '#374151' }}>
            {mcp != null ? `${mcp.toFixed(0)}°` : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-600 w-6">PIP</span>
          <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pctPip}%`, background: color, opacity: 0.7 }} />
          </div>
          <span className="text-xs tabular-nums w-10 text-right" style={{ color: pip != null ? color : '#374151' }}>
            {pip != null ? `${pip.toFixed(0)}°` : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

export function JointAnglePanel({ jointAngles = {}, angleHistory = {} }) {
  const [showHands, setShowHands] = useState(true)
  const hasAnyAngle = Object.keys(jointAngles).length > 0

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          📐 Joint Angles (Quick View)
          {!hasAnyAngle && <span className="text-xs text-gray-500 font-normal">(waiting…)</span>}
        </h2>
        <button
          onClick={() => setShowHands(v => !v)}
          className={`text-xs px-3 py-1 rounded font-medium transition ${
            showHands ? 'bg-blue-800 text-blue-200 hover:bg-blue-700' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          🖐 Hands {showHands ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
        {BODY_ANGLE_GROUPS.map(group => (
          <div key={group.label}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: group.color }}>
              {group.label}
            </div>
            <div className="flex flex-col gap-1.5">
              {group.angles.map(({ key, label }) => (
                <AngleCard
                  key={key}
                  angleKey={key}
                  label={label}
                  color={group.color}
                  value={jointAngles[key] ?? null}
                  history={angleHistory[key] || []}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {showHands && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
          {['left', 'right'].map(side => (
            <div key={side}>
              <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${side === 'left' ? 'text-green-400' : 'text-blue-400'}`}>
                {side === 'left' ? '✋' : '🤚'} {side.charAt(0).toUpperCase() + side.slice(1)} Hand
              </div>
              <div className="space-y-0.5">
                {HAND_FINGERS.map(finger => (
                  <FingerRow key={finger} side={side} finger={finger} jointAngles={jointAngles} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}