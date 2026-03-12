/*
######################
#  JointAnglePanel.jsx
#
# Real-time joint angle visualization panel
# Shows body + hand angles with mini sparklines and color-coded gauges
#
# Author: Michelangelo Guaitolini, 12.03.2026
######################
*/

import React, { useMemo, useState } from 'react'
import {
  LineChart, Line, ResponsiveContainer, YAxis, Tooltip,
} from 'recharts'

// ── Config ─────────────────────────────────────────────────────────────────────

const BODY_ANGLE_GROUPS = [
  {
    label: 'Shoulders',
    color: '#38bdf8',
    angles: [
      { key: 'left_shoulder',  label: 'Shoulder L' },
      { key: 'right_shoulder', label: 'Shoulder R' },
    ],
  },
  {
    label: 'Elbows',
    color: '#fb923c',
    angles: [
      { key: 'left_elbow',  label: 'Elbow L' },
      { key: 'right_elbow', label: 'Elbow R' },
    ],
  },
  {
    label: 'Wrists',
    color: '#a78bfa',
    angles: [
      { key: 'left_wrist',  label: 'Wrist L' },
      { key: 'right_wrist', label: 'Wrist R' },
    ],
  },
  {
    label: 'Hips',
    color: '#4ade80',
    angles: [
      { key: 'left_hip',  label: 'Hip L' },
      { key: 'right_hip', label: 'Hip R' },
    ],
  },
  {
    label: 'Knees',
    color: '#facc15',
    angles: [
      { key: 'left_knee',  label: 'Knee L' },
      { key: 'right_knee', label: 'Knee R' },
    ],
  },
  {
    label: 'Ankles',
    color: '#f472b6',
    angles: [
      { key: 'left_ankle',  label: 'Ankle L' },
      { key: 'right_ankle', label: 'Ankle R' },
    ],
  },
  {
    label: 'Trunk',
    color: '#94a3b8',
    angles: [
      { key: 'trunk_lean',     label: 'Trunk Lean' },
      { key: 'shoulder_tilt',  label: 'Shoulder Tilt' },
    ],
  },
]

const HAND_FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky']

const JOINT_RANGES = {
  default:          [0, 180],
  left_shoulder:    [0, 180],
  right_shoulder:   [0, 180],
  left_elbow:       [0, 160],
  right_elbow:      [0, 160],
  left_knee:        [0, 160],
  right_knee:       [0, 160],
  left_hip:         [0, 130],
  right_hip:        [0, 130],
  left_ankle:       [60, 140],
  right_ankle:      [60, 140],
  trunk_lean:       [0, 40],
}

function getRange(key) {
  return JOINT_RANGES[key] || JOINT_RANGES.default
}

function angleToPercent(key, val) {
  const [min, max] = getRange(key)
  return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100))
}

function alertColor(key, val) {
  if (!val && val !== 0) return ''
  const [min, max] = getRange(key)
  const pct = (val - min) / (max - min)
  if (pct > 0.92 || pct < 0.05) return 'text-red-400 animate-pulse'
  if (pct > 0.80 || pct < 0.12) return 'text-yellow-400'
  return ''
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Sparkline({ data, color }) {
  const chartData = useMemo(() => data.map((v, i) => ({ i, v })), [data])
  if (!data || data.length < 2) {
    return <div className="h-10 opacity-20 bg-gray-700 rounded" />
  }
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <YAxis domain={['auto', 'auto']} hide />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: 'none', fontSize: 10, padding: '2px 6px' }}
          formatter={v => [`${v}°`, '']}
          labelFormatter={() => ''}
        />
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function AngleCard({ angleKey, label, color, value, history }) {
  const pct    = value != null ? angleToPercent(angleKey, value) : 0
  const alert  = value != null ? alertColor(angleKey, value) : ''
  const hasVal = value != null

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-3 flex flex-col gap-1">
      {/* Label + value */}
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
        <span className={`text-lg font-bold tabular-nums ${alert || ''}`}
              style={{ color: hasVal ? color : '#374151' }}>
          {hasVal ? `${value}°` : '---'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-100"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>

      {/* Sparkline */}
      <Sparkline data={history} color={color} />
    </div>
  )
}

function FingerRow({ side, finger, jointAngles }) {
  const mcpKey = `${side}_${finger}_mcp`
  const pipKey = `${side}_${finger}_pip`
  const mcp = jointAngles[mcpKey]
  const pip = jointAngles[pipKey]

  const color = side === 'left' ? '#4ade80' : '#60a5fa'
  const pctMcp = mcp != null ? angleToPercent('default', mcp) : 0
  const pctPip = pip != null ? angleToPercent('default', pip) : 0

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-xs text-gray-500 w-14 capitalize">{finger}</span>
      <div className="flex-1 flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-600 w-7">MCP</span>
          <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-100"
                 style={{ width: `${pctMcp}%`, background: color }} />
          </div>
          <span className="text-xs tabular-nums w-9 text-right" style={{ color: mcp != null ? color : '#374151' }}>
            {mcp != null ? `${mcp}°` : '---'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-600 w-7">PIP</span>
          <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-100"
                 style={{ width: `${pctPip}%`, background: color, opacity: 0.7 }} />
          </div>
          <span className="text-xs tabular-nums w-9 text-right" style={{ color: pip != null ? color : '#374151' }}>
            {pip != null ? `${pip}°` : '---'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function JointAnglePanel({ jointAngles = {}, angleHistory = {} }) {
  const [showHands, setShowHands] = useState(true)

  const hasAnyAngle = Object.keys(jointAngles).length > 0

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold flex items-center gap-2">
          📐 Joint Angles
          {!hasAnyAngle && (
            <span className="text-xs text-gray-500 font-normal ml-2">
              (waiting for pose data…)
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowHands(v => !v)}
          className={`text-xs px-3 py-1 rounded transition font-medium ${
            showHands
              ? 'bg-blue-800 text-blue-200 hover:bg-blue-700'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          {showHands ? '🖐 Hands ON' : '🖐 Hands OFF'}
        </button>
      </div>

      {/* Body angle groups */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
        {BODY_ANGLE_GROUPS.map(group => (
          <div key={group.label}>
            <div className="text-xs font-semibold uppercase tracking-widest mb-2"
                 style={{ color: group.color }}>
              {group.label}
            </div>
            <div className="flex flex-col gap-2">
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

      {/* Hand finger angles */}
      {showHands && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-700">
          {/* Left hand */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest mb-3 text-green-400">
              ✋ Left Hand — Finger Flexion
            </div>
            <div className="space-y-1">
              {HAND_FINGERS.map(finger => (
                <FingerRow
                  key={`left-${finger}`}
                  side="left"
                  finger={finger}
                  jointAngles={jointAngles}
                />
              ))}
            </div>
          </div>

          {/* Right hand */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest mb-3 text-blue-400">
              🤚 Right Hand — Finger Flexion
            </div>
            <div className="space-y-1">
              {HAND_FINGERS.map(finger => (
                <FingerRow
                  key={`right-${finger}`}
                  side="right"
                  finger={finger}
                  jointAngles={jointAngles}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}