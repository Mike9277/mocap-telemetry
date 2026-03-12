/**
 * Dashboard.jsx
 * Main dashboard — wholebody pose + clinical joint angle analysis
 * Author: Michelangelo Guaitolini, 12.03.2026
 */

import React, { useState, useEffect } from 'react'
import { useMocapWebSocket }  from '../hooks/useMocapWebSocket'
import { SensorStatus }       from './SensorStatus'
import { JointChart }         from './JointChart'
import { PoseVisualization }  from './PoseVisualization'
import { KeypointXYTraces }   from './KeypointXYTraces'
import { JointAnglePanel }    from './JointAnglePanel'
import ClinicalAnglesView     from './ClinicalAnglesView'

// ── Constants ─────────────────────────────────────────────────────────────────

const BODY_KEYPOINTS = [
  'nose',
  'left_eye_inner','left_eye','left_eye_outer',
  'right_eye_inner','right_eye','right_eye_outer',
  'left_ear','right_ear','mouth_left','mouth_right',
  'left_shoulder','right_shoulder',
  'left_elbow','right_elbow',
  'left_wrist','right_wrist',
  'left_pinky','right_pinky',
  'left_index','right_index',
  'left_thumb','right_thumb',
  'left_hip','right_hip',
  'left_knee','right_knee',
  'left_ankle','right_ankle',
  'left_heel','right_heel',
  'left_foot_index','right_foot_index',
]

const HAND_LANDMARK_NAMES = [
  'wrist',
  'thumb_cmc','thumb_mcp','thumb_ip','thumb_tip',
  'index_finger_mcp','index_finger_pip','index_finger_dip','index_finger_tip',
  'middle_finger_mcp','middle_finger_pip','middle_finger_dip','middle_finger_tip',
  'ring_finger_mcp','ring_finger_pip','ring_finger_dip','ring_finger_tip',
  'pinky_mcp','pinky_pip','pinky_dip','pinky_tip',
]

const KEYPOINT_OPTIONS = [
  'nose','left_shoulder','right_shoulder',
  'left_elbow','right_elbow',
  'left_wrist','right_wrist',
  'left_hip','right_hip',
  'left_knee','right_knee',
  'left_ankle','right_ankle',
]

const JOINT_OPTIONS = [
  { id: 'head',           label: 'Head' },
  { id: 'shoulder_left',  label: 'Left Shoulder' },
  { id: 'shoulder_right', label: 'Right Shoulder' },
  { id: 'hand_left',      label: 'Left Hand' },
  { id: 'hand_right',     label: 'Right Hand' },
]

// ── View tabs ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'clinical', label: '📐 Clinical Kinematics' },
  { id: 'quick',    label: '⚡ Quick Angles' },
  { id: 'traces',   label: '📈 Trajectories' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const {
    frames,
    isConnected,
    error,
    poseData,
    jointAngles,
    angleHistory,
  } = useMocapWebSocket()

  const [selectedKeypoints, setSelectedKeypoints] = useState(['nose', 'left_wrist', 'right_wrist'])
  const [selectedJoints,    setSelectedJoints]    = useState(['head'])
  const [isRecording,       setIsRecording]       = useState(false)
  const [recordedFrames,    setRecordedFrames]    = useState([])
  const [samplingHz,        setSamplingHz]        = useState(24)
  const [activeTab,         setActiveTab]         = useState('clinical')

  const isPoseMode = !!(poseData && poseData.keypoints)

  // ── Recording ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRecording || frames.length === 0) return
    const latest = frames[frames.length - 1]
    setRecordedFrames(prev => {
      const last = prev[prev.length - 1]
      if (last && last.frame_count === latest.frame_count) return prev
      return [...prev, latest]
    })
  }, [frames, isRecording])

  // ── CSV export ─────────────────────────────────────────────────────────────
  const downloadCSV = () => {
    if (recordedFrames.length === 0) { alert('No recorded data'); return }

    const bodyKptCols = BODY_KEYPOINTS.flatMap(k => [`${k}_x`,`${k}_y`,`${k}_z`,`${k}_conf`])
    const lhCols      = HAND_LANDMARK_NAMES.flatMap(k => [`lh_${k}_x`,`lh_${k}_y`,`lh_${k}_conf`])
    const rhCols      = HAND_LANDMARK_NAMES.flatMap(k => [`rh_${k}_x`,`rh_${k}_y`,`rh_${k}_conf`])

    const allAngleKeys = new Set()
    recordedFrames.forEach(f => {
      if (f.joint_angles) Object.keys(f.joint_angles).forEach(k => allAngleKeys.add(k))
    })
    const angleKeys = Array.from(allAngleKeys).sort()

    const header = ['timestamp','frame_count','sensor_id',...bodyKptCols,...lhCols,...rhCols,...angleKeys].join(',')

    const rows = recordedFrames.map(f => {
      const bv = BODY_KEYPOINTS.flatMap(k => {
        const d = f.keypoints?.[k]
        return d ? [d.x, d.y, d.z ?? 0, d.confidence] : ['NaN','NaN','NaN','NaN']
      })
      const lv = HAND_LANDMARK_NAMES.flatMap(k => {
        const d = f.left_hand_keypoints?.[k]
        return d ? [d.x, d.y, d.confidence] : ['NaN','NaN','NaN']
      })
      const rv = HAND_LANDMARK_NAMES.flatMap(k => {
        const d = f.right_hand_keypoints?.[k]
        return d ? [d.x, d.y, d.confidence] : ['NaN','NaN','NaN']
      })
      const av = angleKeys.map(k => f.joint_angles?.[k] != null ? f.joint_angles[k] : 'NaN')
      return [f.timestamp, f.frame_count, f.sensor_id, ...bv, ...lv, ...rv, ...av].join(',')
    })

    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: `wholebody_${Date.now()}.csv` })
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Toggles ────────────────────────────────────────────────────────────────
  const toggleKpt   = id => setSelectedKeypoints(p => p.includes(id) ? p.filter(k => k !== id) : [...p, id])
  const toggleJoint = id => setSelectedJoints(p => p.includes(id) ? p.filter(j => j !== id) : [...p, id])

  const angleCount = jointAngles ? Object.keys(jointAngles).length : 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">🦾 Mocap Telemetry Dashboard</h1>
        <p className="text-gray-400 text-sm">Real-time wholebody pose &amp; clinical joint angle analysis</p>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <span className={`inline-block w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className={isConnected ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>
          {isConnected ? '✓ Connected' : '✗ Disconnected'}
        </span>
        <span className="px-2 py-0.5 bg-blue-900 text-blue-200 rounded text-xs">
          {isPoseMode ? 'MediaPipe Wholebody' : 'Mocap'}
        </span>
        {angleCount > 0 && (
          <span className="px-2 py-0.5 bg-purple-900 text-purple-200 rounded text-xs">
            {angleCount} angles
          </span>
        )}
        {poseData?.has_person && (
          <span className="px-2 py-0.5 bg-green-900 text-green-200 rounded text-xs">
            ✓ Person detected
          </span>
        )}
        {error && <span className="text-red-400 text-xs">{error}</span>}
      </div>

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Frames',   value: frames.length },
          { label: 'Recorded', value: recordedFrames.length },
          { label: 'Angles',   value: angleCount },
          { label: 'Status',   value: isRecording ? '🔴 REC' : '⚪ IDLE' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-800 rounded-lg border border-gray-700 p-3 text-center">
            <div className="text-xl font-bold text-white">{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Sensor status ───────────────────────────────────────────────── */}
      <SensorStatus />

      {/* ── Recording controls ──────────────────────────────────────────── */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
        <h2 className="text-base font-bold mb-3">🎬 Recording Controls</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={() => setIsRecording(v => !v)}
            className={`px-5 py-2 rounded-lg font-bold text-sm transition ${
              isRecording
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isRecording ? '⏸ Stop' : '🔴 Start Recording'}
          </button>
          <button
            onClick={() => setRecordedFrames([])}
            className="px-5 py-2 rounded-lg font-bold text-sm bg-gray-700 hover:bg-gray-600 text-white transition"
          >
            🗑 Clear
          </button>
          <button
            onClick={downloadCSV}
            disabled={recordedFrames.length === 0}
            className="px-5 py-2 rounded-lg font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-40"
          >
            💾 Download CSV
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-gray-400">Hz</label>
            <input
              type="number" min="10" max="60"
              value={samplingHz}
              onChange={e => setSamplingHz(Math.max(10, Math.min(60, parseInt(e.target.value) || 24)))}
              className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-center text-white"
            />
          </div>
        </div>
        {isRecording && (
          <p className="text-xs text-red-400 mt-2">● Recording… {recordedFrames.length} frames</p>
        )}
        {!isRecording && recordedFrames.length > 0 && (
          <p className="text-xs text-gray-400 mt-2">Stopped — {recordedFrames.length} frames ready for export</p>
        )}
      </div>

      {/* ── POSE MODE ───────────────────────────────────────────────────── */}
      {isPoseMode && (
        <>
          {/* Video + status */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
            <h2 className="text-base font-bold mb-4">📊 Wholebody Pose</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Video */}
              <div className="border-2 border-green-500 rounded-lg overflow-hidden bg-black">
                <PoseVisualization poseData={poseData} width={640} height={480} />
              </div>
              {/* Info */}
              <div className="flex flex-col gap-3">
                <div className="bg-gray-900 rounded-lg border border-gray-700 p-3">
                  <h3 className="text-sm font-semibold text-green-400 mb-2">Status</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Frame</span>
                      <span className="text-blue-400 font-mono">{poseData?.frame_count ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Body keypoints</span>
                      <span className="text-blue-400 font-mono">
                        {poseData?.keypoints ? Object.keys(poseData.keypoints).length : 0}/33
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Left hand</span>
                      <span className={poseData?.left_hand_keypoints && Object.keys(poseData.left_hand_keypoints).length > 0 ? 'text-green-400' : 'text-gray-600'}>
                        {poseData?.left_hand_keypoints && Object.keys(poseData.left_hand_keypoints).length > 0 ? '✓ 21 pts' : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Right hand</span>
                      <span className={poseData?.right_hand_keypoints && Object.keys(poseData.right_hand_keypoints).length > 0 ? 'text-green-400' : 'text-gray-600'}>
                        {poseData?.right_hand_keypoints && Object.keys(poseData.right_hand_keypoints).length > 0 ? '✓ 21 pts' : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Angles computed</span>
                      <span className="text-purple-400 font-mono">{angleCount}</span>
                    </div>
                  </div>
                </div>

                {/* Keypoint selector */}
                <div className="bg-gray-900 rounded-lg border border-gray-700 p-3">
                  <h3 className="text-sm font-semibold text-green-400 mb-2">
                    Keypoints for trajectories
                    <span className="text-gray-500 font-normal ml-2">({selectedKeypoints.length} selected)</span>
                  </h3>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {KEYPOINT_OPTIONS.map(kpt => (
                      <button
                        key={kpt}
                        onClick={() => toggleKpt(kpt)}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                          selectedKeypoints.includes(kpt)
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {kpt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Analysis tabs ────────────────────────────────────────────── */}
          <div className="mb-4 flex gap-1 border-b border-gray-700">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t transition ${
                  activeTab === tab.id
                    ? 'bg-gray-800 border border-b-gray-800 border-gray-700 text-white -mb-px'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'clinical' && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
              <ClinicalAnglesView jointAngles={jointAngles} angleHistory={angleHistory} />
            </div>
          )}

          {activeTab === 'quick' && (
            <JointAnglePanel jointAngles={jointAngles} angleHistory={angleHistory} />
          )}

          {activeTab === 'traces' && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
              <h2 className="text-base font-bold mb-4">📈 Keypoint Trajectories (X, Y)</h2>
              <KeypointXYTraces frames={frames} selectedKeypoints={selectedKeypoints} />
            </div>
          )}
        </>
      )}

      {/* ── LEGACY MOCAP MODE ───────────────────────────────────────────── */}
      {!isPoseMode && (
        <>
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
            <h2 className="text-base font-bold mb-3">Select Channels</h2>
            <div className="flex flex-wrap gap-2">
              {JOINT_OPTIONS.map(j => (
                <button
                  key={j.id}
                  onClick={() => toggleJoint(j.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    selectedJoints.includes(j.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {j.label}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
            <h2 className="text-base font-bold mb-4">Live Data</h2>
            {selectedJoints.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Select at least one channel</p>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {selectedJoints.map(joint => (
                  <JointChart
                    key={joint}
                    data={frames
                      .filter(f => f.joints?.[joint])
                      .map(f => ({ timestamp: f.timestamp, x: f.joints[joint][0], y: f.joints[joint][1], z: f.joints[joint][2] }))}
                    joint={joint}
                    title={`${joint.toUpperCase()} Position`}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Debug footer ────────────────────────────────────────────────── */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-3 text-gray-500 text-xs font-mono">
        buffer: {frames.length} frames | recorded: {recordedFrames.length} | hz: {samplingHz}
        {isPoseMode && ` | pose#${poseData?.frame_count ?? 0} | angles: ${angleCount}`}
      </div>

    </div>
  )
}