import React, { useState } from 'react'
import { useMocapWebSocket } from '../hooks/useMocapWebSocket'
import { SensorStatus } from './SensorStatus'
import { JointChart } from './JointChart'
import { PoseVisualization } from './PoseVisualization'
import { KeypointTraces } from './KeypointTraces'
import { KeypointXYTraces } from './KeypointXYTraces'

export function Dashboard() {
  const { frames, isConnected, error, poseData, getJointHistory } = useMocapWebSocket()
  const [selectedJoints, setSelectedJoints] = useState(['head'])
  const [selectedKeypoints, setSelectedKeypoints] = useState(['nose', 'left_wrist', 'right_wrist'])
  const [isRecording, setIsRecording] = useState(false)
  const [recordedFrames, setRecordedFrames] = useState([])
  const [samplingFrequency, setSamplingFrequency] = useState(30)
  
  // TUTTI i keypoints (sempre salvati in recording, selezionati solo per viz)
  const allKeypoints = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle"
  ]

  const isPoseMode = poseData && poseData.keypoints

  const jointOptions = [
    { id: 'head', label: 'Head' },
    { id: 'shoulder_left', label: 'Left Shoulder' },
    { id: 'shoulder_right', label: 'Right Shoulder' },
    { id: 'hand_left', label: 'Left Hand' },
    { id: 'hand_right', label: 'Right Hand' },
  ]

  const keypointOptions = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle"
  ]

  const toggleJoint = (jointId) => {
    setSelectedJoints(prev => 
      prev.includes(jointId)
        ? prev.filter(j => j !== jointId)
        : [...prev, jointId]
    )
  }

  const toggleKeypoint = (keypointId) => {
    setSelectedKeypoints(prev => 
      prev.includes(keypointId)
        ? prev.filter(k => k !== keypointId)
        : [...prev, keypointId]
    )
  }

  React.useEffect(() => {
    if (isRecording && frames.length > 0) {
      const latestFrame = frames[frames.length - 1]
      if (recordedFrames.length === 0 || recordedFrames[recordedFrames.length - 1].frame_count !== latestFrame.frame_count) {
        setRecordedFrames(prev => [...prev, latestFrame])
      }
    }
  }, [frames, isRecording, recordedFrames])

  const downloadCSV = () => {
    if (recordedFrames.length === 0) {
      alert('Nessun dato registrato')
      return
    }

    // SEMPRE salva TUTTI i keypoints (con NaN se non disponibili)
    let csv = 'timestamp,frame_count,sensor_id'
    allKeypoints.forEach(kpt => {
      csv += `,${kpt}_x,${kpt}_y,${kpt}_conf`
    })
    csv += '\n'

    recordedFrames.forEach(frame => {
      csv += `${frame.timestamp},${frame.frame_count},${frame.sensor_id}`
      
      if (frame.keypoints) {
        // Salva TUTTI i keypoints, NaN se non disponibile
        allKeypoints.forEach(kpt => {
          const kpt_data = frame.keypoints[kpt]
          if (kpt_data && kpt_data.confidence > 0) {
            csv += `,${kpt_data.x},${kpt_data.y},${kpt_data.confidence}`
          } else {
            csv += `,NaN,NaN,NaN`
          }
        })
      }
      csv += '\n'
    })

    const element = document.createElement('a')
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv))
    element.setAttribute('download', `mocap_data_${new Date().getTime()}.csv`)
    element.style.display = 'none'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const stats = {
    totalFrames: frames.length,
    fps: samplingFrequency,
    connected: isConnected,
    recordedCount: recordedFrames.length,
    mode: isPoseMode ? 'Pose Detection' : 'Mocap'
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">🎯 Mocap Telemetry Dashboard</h1>
        <p className="text-gray-400">Real-time motion capture & pose detection</p>
      </div>

      {/* Status Connection */}
      <div className="mb-6 flex items-center gap-3">
        <span className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
        <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
          {isConnected ? '✓ Connected to Backend' : '✗ Disconnected'}
        </span>
        <span className="ml-4 px-3 py-1 bg-blue-900 text-blue-200 rounded text-sm">
          Mode: {stats.mode}
        </span>
        {error && <span className="text-red-400 text-sm ml-4">{error}</span>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="metric-card">
          <div className="metric-value">{stats.totalFrames}</div>
          <div className="metric-label">Frames</div>
        </div>
        <div className="metric-card">
          <input
            type="number"
            min="30"
            max="100"
            value={samplingFrequency}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 30
              setSamplingFrequency(Math.max(30, Math.min(100, val)))
            }}
            className="metric-value bg-gray-700 text-white border border-gray-600 rounded px-2 text-center"
          />
          <div className="metric-label">Sampling Frequency (Hz)</div>
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

      {/* Sensor Status */}
      <SensorStatus />

      {/* Recording Controls */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
        <h2 className="text-2xl font-bold mb-4">🎬 Recording Controls</h2>
        
        <div className="flex flex-wrap gap-4 mb-6">
          <button
            onClick={() => setIsRecording(!isRecording)}
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
            🗑 Clear Data
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
          {isRecording && (
            <p>Recording... {recordedFrames.length} frames captured</p>
          )}
          {!isRecording && recordedFrames.length > 0 && (
            <p>Stopped. {recordedFrames.length} frames ready to export</p>
          )}
        </div>
      </div>

      {/* POSE DETECTION LAYOUT */}
      {poseData && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
          <h2 className="text-2xl font-bold mb-6">📊 Pose Analysis</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: Video + Details */}
            <div className="flex flex-col gap-4">
              {/* Video */}
              <div className="border-2 border-green-500 rounded-lg overflow-hidden bg-black">
                <PoseVisualization poseData={poseData} width={640} height={480} />
              </div>
              
              {/* Details */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
                <h3 className="text-lg font-semibold text-green-400 mb-3">📋 Status</h3>
                <div className="space-y-2 text-sm">
                  <p>Frame: <span className="text-blue-400 font-bold">{poseData?.frame_count || 0}</span></p>
                  <p>Persona: <span className={poseData?.has_person ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{poseData?.has_person ? '✓ Rilevata' : '✗ Non rilevata'}</span></p>
                  <p>Keypoints: <span className="text-blue-400 font-bold">{poseData?.keypoints ? Object.keys(poseData.keypoints).length : 0}</span></p>
                </div>
              </div>
            </div>

            {/* RIGHT: Keypoint Selector + 2D Traces */}
            <div className="flex flex-col gap-4">
              {/* Keypoint Selection */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-600">
                <h3 className="text-lg font-semibold text-green-400 mb-3">🎯 Seleziona Keypoints</h3>
                <div className="flex flex-wrap gap-2 mb-3 max-h-32 overflow-y-auto pb-2">
                  {keypointOptions.map(kpt => (
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
                <p className="text-xs text-gray-400">{selectedKeypoints.length} keypoint(s) selezionato(i)</p>
              </div>
              
              {/* 2D Traces */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-600 flex-1 overflow-y-auto">
                <h3 className="text-lg font-semibold text-green-400 mb-3">📈 Tracciati 2D (X, Y)</h3>
                <KeypointXYTraces 
                  frames={frames}
                  selectedKeypoints={selectedKeypoints}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEPRECATED: LIVE VIDEO - REMOVED */}
      {/* DEPRECATED: Extended Trajectories - REMOVED */}

      {/* Mocap Mode */}
      {!isPoseMode && (
        <>
          {/* Joint Selection */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
            <h2 className="text-2xl font-bold mb-4">Select Channels</h2>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {jointOptions.map(joint => (
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

            <div className="text-sm text-gray-400">
              {selectedJoints.length} channel(s) selected
            </div>
          </div>

          {/* Charts for Selected Joints */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
            <h2 className="text-2xl font-bold mb-4">Live Data</h2>
            
            {selectedJoints.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                Select at least one channel to view data
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {selectedJoints.map(joint => (
                  <JointChart
                    key={joint}
                    data={frames
                      .filter(f => f.joints && f.joints[joint])
                      .map(f => ({
                        timestamp: f.timestamp,
                        x: f.joints[joint][0],
                        y: f.joints[joint][1],
                        z: f.joints[joint][2]
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

      {/* Debug Info */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 text-gray-400 text-xs font-mono">
        <p>Frames in buffer: {frames.length}</p>
        <p>Frames recorded: {recordedFrames.length}</p>
        <p>Sampling frequency: {samplingFrequency} Hz</p>
        {isPoseMode && poseData && (
          <>
            <p>Pose Detection Frame: {poseData.frame_count}</p>
            <p>Person Detected: {poseData.has_person ? 'Yes' : 'No'}</p>
          </>
        )}
      </div>
    </div>
  )
}
