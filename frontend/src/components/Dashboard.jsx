/*
######################
#  Dashboard.jsx
#
# Main Dashboard Component — Wholebody Pose + Joint Angle Analysis
# Integrates MediaPipe Holistic data: body, hands, and real-time angles
#
# Author: Michelangelo Guaitolini, 12.03.2026
######################
*/

import React, { useState } from 'react'
import { useMocapWebSocket } from '../hooks/useMocapWebSocket'
import { SensorStatus }      from './SensorStatus'
import { JointChart }        from './JointChart'
import { PoseVisualization } from './PoseVisualization'
import { KeypointTraces }    from './KeypointTraces'
import { KeypointXYTraces }  from './KeypointXYTraces'
import { JointAnglePanel }   from './JointAnglePanel'

// ── Keypoint lists ─────────────────────────────────────────────────────────────

/** 33 MediaPipe Pose landmarks (body) */
const BODY_KEYPOINTS = [
  'nose',
  'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear',
  'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_pinky', 'right_pinky',
  'left_index', 'right_index',
  'left_thumb', 'right_thumb',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
  'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
]

/** 21 MediaPipe Hand landmarks */
const HAND_LANDMARK_NAMES = [
  'wrist',
  'thumb_cmc', 'thumb_mcp', 'thumb_ip', 'thumb_tip',
  'index_finger_mcp', 'index_finger_pip', 'index_finger_dip', 'index_finger_tip',
  'middle_finger_mcp', 'middle_finger_pip', 'middle_finger_dip', 'middle_finger_tip',
  'ring_finger_mcp', 'ring_finger_pip', 'ring_finger_dip', 'ring_finger_tip',
  'pinky_mcp', 'pinky_pip', 'pinky_dip', 'pinky_tip',
]

/** Keypoints shown in the UI selector (body only, for trajectory charts) */
const KEYPOINT_OPTIONS_BODY = [
  'nose', 'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
]

/** Legacy joint options for traditional mocap mode */
const JOINT_OPTIONS = [
  { id: 'head',          label: 'Head' },
  { id: 'shoulder_left', label: 'Left Shoulder' },
  { id: 'shoulder_right',label: 'Right Shoulder' },
  { id: 'hand_left',     label: 'Left Hand' },
  { id: 'hand_right',    label: 'Right Hand' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const {
    frames, isConnected, error,
    poseData, jointAngles, angleHistory,
    getJointHistory,
  } = useMocapWebSocket()

  const [selectedJoints,     setSelectedJoints]     = useState(['head'])
  const [selectedKeypoints,  setSelectedKeypoints]  = useState(['nose', 'left_wrist', 'right_wrist'])
  const [isRecording,        setIsRecording]        = useState(false)
  const [recordedFrames,     setRecordedFrames]     = useState([])
  const [samplingFrequency,  setSamplingFrequency]  = useState(24)

  const isPoseMode = !!(poseData && poseData.keypoints)

  // ── Recording logic ───────────────────────────────────────────────────────

  React.useEffect(() => {
    if (isRecording && frames.length > 0) {
      const latest = frames[frames.length - 1]
      const last   = recordedFrames[recordedFrames.length - 1]
      if (!last || last.frame_count !== latest.frame_count) {
        setRecordedFrames(prev => [...prev, latest])
      }
    }
  }, [frames, isRecording, recordedFrames])

  // ── CSV export ─────────────────────────────────────────────────────────────

  const downloadCSV = () => {
    if (recordedFrames.length === 0) {
      alert('No recorded data')
      return
    }

    // Build header
    const bodyKptCols  = BODY_KEYPOINTS.flatMap(k => [`${k}_x`, `${k}_y`, `${k}_z`, `${k}_conf`])
    const lhKptCols    = HAND_LANDMARK_NAMES.flatMap(k => [`lh_${k}_x`, `lh_${k}_y`, `lh_${k}_conf`])
    const rhKptCols    = HAND_LANDMARK_NAMES.flatMap(k => [`rh_${k}_x`, `rh_${k}_y`, `rh_${k}_conf`])

    // Collect all angle keys that ever appeared
    const allAngleKeys = new Set()
    recordedFrames.forEach(f => {
      if (f.joint_angles) Object.keys(f.joint_angles).forEach(k => allAngleKeys.add(k))
    })
    const angleKeys = Array.from(allAngleKeys).sort()

    const header = [
      'timestamp', 'frame_count', 'sensor_id',
      ...bodyKptCols,
      ...lhKptCols,
      ...rhKptCols,
      ...angleKeys,
    ].join(',')

    const rows = recordedFrames.map(frame => {
      const bodyKptVals = BODY_KEYPOINTS.flatMap(k => {
        const kd = frame.keypoints?.[k]
        return kd
          ? [kd.x, kd.y, kd.z ?? 0, kd.confidence]
          : ['NaN', 'NaN', 'NaN', 'NaN']
      })

      const lhVals = HAND_LANDMARK_NAMES.flatMap(k => {
        const kd = frame.left_hand_keypoints?.[k]
        return kd ? [kd.x, kd.y, kd.confidence] : ['NaN', 'NaN', 'NaN']
      })

      const rhVals = HAND_LANDMARK_NAMES.flatMap(k => {
        const kd = frame.right_hand_keypoints?.[k]
        return kd ? [kd.x, kd.y, kd.confidence] : ['NaN', 'NaN', 'NaN']
      })

      const angleVals = angleKeys.map(k =>
        frame.joint_angles?.[k] != null ? frame.joint_angles[k] : 'NaN'
      )

      return [
        frame.timestamp, frame.frame_count, frame.sensor_id,
        ...bodyKptVals, ...lhVals, ...rhVals, ...angleVals,
      ].join(',')
    })

    const csv = [header, ...rows].join('\n')
    const el  = document.createElement('a')
    el.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    el.download = `wholebody_${Date.now()}.csv`
    el.click()
  }

  // ── Toggles ───────────────────────────────────────────────────────────────

  const toggleJoint = id =>
    setSelectedJoints(prev =>
      prev.includes(id) ? prev.filter(j => j !== id) : [...prev, id]
    )

  const toggleKeypoint = id =>
    setSelectedKeypoints(prev =>
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    )

  const stats = {
    totalFrames:   frames.length,
    recordedCount: recordedFrames.length,
    mode:          isPoseMode ? 'Wholebody (MediaPipe)' : 'Mocap',
    angleCount:    Object.keys(jointAngles).length,
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-1">🦾 Mocap Telemetry Dashboard</h1>
        <p className="text-gray-400">Real-time wholebody pose & joint angle analysis</p>
      </div>

      {/* Connection status */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
          {isConnected ? '✓ Connected' : '✗ Disconnected'}
        </span>
        <span className="px-3 py-1 bg-blue-900 text-blue-200 rounded text-sm">
          {stats.mode}
        </span>
        {stats.angleCount > 0 && (
          <span className="px-3 py-1 bg-purple-900 text-purple-200 rounded text-sm">
            📐 {stats.angleCount} angles computed
          </span>
        )}
        {error && <span className="text-red-400 text-sm">{error}</span>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="metric-card">
          <div className="metric-value">{stats.totalFrames}</div>
          <div className="metric-label">Frames</div>
        </div>
        <div className="metric-card">
          <input
            type="number" min="10" max="60"
            value={samplingFrequency}
            onChange={e => setSamplingFrequency(Math.max(10, Math.min(60, parseInt(e.target.value) || 24)))}
            className="metric-value bg-gray-700 text-white border border-gray-600 rounded px-2 text-center w-full"
          />
          <div className="metric-label">Sampling (Hz)</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.recordedCount}</div>
          <div className="metric-label">Recorded</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{isRecording ? '🔴' : '⚪'}</div>
          <div className="metric-label">{isRecording ? 'Recording' : 'Stopped'}</div>
        </div>
      </div>

      {/* Sensor status */}
      <SensorStatus />

      {/* Recording controls */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
        <h2 className="text-2xl font-bold mb-4">🎬 Recording Controls</h2>
        <div className="flex flex-wrap gap-4 mb-4">
          <button
            onClick={() => setIsRecording(v => !v)}
            className={`px-6 py-2 rounded-lg font-bold transition ${
              isRecording
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isRecording ? '⏸ Stop Recording' : '🔴 Start Recording'}
          </button>
          <button
            onClick={() => setRecordedFrames([])}
            className="px-6 py-2 rounded-lg font-bold bg-gray-700 hover:bg-gray-600 text-white transition"
          >
            🗑 Clear
          </button>
          <button
            onClick={downloadCSV}
            disabled={recordedFrames.length === 0}
            className="px-6 py-2 rounded-lg font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
          >
            💾 Download CSV
          </button>
        </div>
        <div className="text-sm text-gray-400">
          {isRecording && <p>Recording… {recordedFrames.length} frames captured</p>}
          {!isRecording && recordedFrames.length > 0 && (
            <p>Stopped. {recordedFrames.length} frames ready — includes body keypoints, hand keypoints, and all joint angles.</p>
          )}
        </div>
      </div>

      {/* ── POSE MODE ────────────────────────────────────────────────────── */}
      {isPoseMode && (
        <>
          {/* Video + status + keypoint selector */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
            <h2 className="text-2xl font-bold mb-6">📊 Wholebody Pose Analysis</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* LEFT: Video */}
              <div className="flex flex-col gap-4">
                <div className="border-2 border-green-500 rounded-lg overflow-hidden bg-black">
                  <PoseVisualization poseData={poseData} width={640} height={480} />
                </div>

                {/* Status */}
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
                  <h3 className="text-lg font-semibold text-green-400 mb-3">📋 Status</h3>
                  <div className="space-y-1 text-sm">
                    <p>Frame: <span className="text-blue-400 font-bold">{poseData?.frame_count || 0}</span></p>
                    <p>Persona: <span className={poseData?.has_person ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                      {poseData?.has_person ? '✓ Rilevata' : '✗ Non rilevata'}
                    </span></p>
                    <p>Body kpts: <span className="text-blue-400 font-bold">
                      {poseData?.keypoints ? Object.keys(poseData.keypoints).length : 0} / 33
                    </span></p>
                    <p>Left hand: <span className={poseData?.left_hand_keypoints && Object.keys(poseData.left_hand_keypoints).length > 0 ? 'text-green-400 font-bold' : 'text-gray-500'}>
                      {poseData?.left_hand_keypoints && Object.keys(poseData.left_hand_keypoints).length > 0 ? '✓ 21 pts' : '—'}
                    </span></p>
                    <p>Right hand: <span className={poseData?.right_hand_keypoints && Object.keys(poseData.right_hand_keypoints).length > 0 ? 'text-green-400 font-bold' : 'text-gray-500'}>
                      {poseData?.right_hand_keypoints && Object.keys(poseData.right_hand_keypoints).length > 0 ? '✓ 21 pts' : '—'}
                    </span></p>
                    <p>Angles: <span className="text-purple-400 font-bold">{Object.keys(jointAngles).length}</span></p>
                  </div>
                </div>
              </div>

              {/* RIGHT: Keypoint selector + 2D traces */}
              <div className="flex flex-col gap-4">
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
                  <h3 className="text-lg font-semibold text-green-400 mb-3">🎯 Seleziona Keypoints</h3>
                  <div className="flex flex-wrap gap-2 mb-3 max-h-32 overflow-y-auto pb-2">
                    {KEYPOINT_OPTIONS_BODY.map(kpt => (
                      <button
                        key={kpt}
                        onClick={() => toggleKeypoint(kpt)}
                        className={`px-3 py-1 rounded text-xs font-medium transition whitespace-nowrap ${
                          selectedKeypoints.includes(kpt)
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {kpt}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">{selectedKeypoints.length} selezionato/i</p>
                </div>

                <div className="bg-gray-900 rounded-lg p-4 border border-gray-600 flex-1 overflow-y-auto">
                  <h3 className="text-lg font-semibold text-green-400 mb-3">📈 Tracciati 2D (X, Y)</h3>
                  <KeypointXYTraces frames={frames} selectedKeypoints={selectedKeypoints} />
                </div>
              </div>
            </div>
          </div>

          {/* ── JOINT ANGLE PANEL ───────────────────────────────────────── */}
          <JointAnglePanel jointAngles={jointAngles} angleHistory={angleHistory} />
        </>
      )}

      {/* ── MOCAP MODE (legacy) ────────────────────────────────────────── */}
      {!isPoseMode && (
        <>
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
            <h2 className="text-2xl font-bold mb-4">Select Channels</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {JOINT_OPTIONS.map(joint => (
                <button
                  key={joint.id}
                  onClick={() => toggleJoint(joint.id)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    selectedJoints.includes(joint.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {joint.label}
                </button>
              ))}
            </div>
            <div className="text-sm text-gray-400">{selectedJoints.length} channel(s) selected</div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
            <h2 className="text-2xl font-bold mb-4">Live Data</h2>
            {selectedJoints.length === 0 ? (
              <div className="text-gray-500 text-center py-8">Select at least one channel</div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {selectedJoints.map(joint => (
                  <JointChart
                    key={joint}
                    data={frames
                      .filter(f => f.joints?.[joint])
                      .map(f => ({
                        timestamp: f.timestamp,
                        x: f.joints[joint][0],
                        y: f.joints[joint][1],
                        z: f.joints[joint][2],
                      }))}
                    joint={joint}
                    title={`${joint.toUpperCase()} Position`}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Debug info */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 text-gray-400 text-xs font-mono mt-6">
        <p>Frames in buffer: {frames.length} | Recorded: {recordedFrames.length} | Hz: {samplingFrequency}</p>
        {isPoseMode && (
          <p>Frame: {poseData?.frame_count || 0} | Person: {poseData?.has_person ? 'Yes' : 'No'} | Angles: {Object.keys(jointAngles).length}</p>
        )}
      </div>
    </div>
  )
}