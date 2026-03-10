import React, { useState } from 'react'
import { useMocapWebSocket } from '../hooks/useMocapWebSocket'
import { SensorStatus } from './SensorStatus'
import { JointChart } from './JointChart'

export function Dashboard() {
  const { frames, isConnected, error, getJointHistory } = useMocapWebSocket()
  const [selectedJoints, setSelectedJoints] = useState(['head'])
  const [isRecording, setIsRecording] = useState(false)
  const [recordedFrames, setRecordedFrames] = useState([])
  const [samplingFrequency, setSamplingFrequency] = useState(30)

  const jointOptions = [
    { id: 'head', label: 'Head' },
    { id: 'shoulder_left', label: 'Left Shoulder' },
    { id: 'shoulder_right', label: 'Right Shoulder' },
    { id: 'hand_left', label: 'Left Hand' },
    { id: 'hand_right', label: 'Right Hand' },
  ]

  // Toggle joint selection
  const toggleJoint = (jointId) => {
    setSelectedJoints(prev => 
      prev.includes(jointId)
        ? prev.filter(j => j !== jointId)
        : [...prev, jointId]
    )
  }

  // Registra frame quando isRecording è true
  React.useEffect(() => {
    if (isRecording && frames.length > 0) {
      const latestFrame = frames[frames.length - 1]
      if (recordedFrames.length === 0 || recordedFrames[recordedFrames.length - 1].frame_count !== latestFrame.frame_count) {
        setRecordedFrames(prev => [...prev, latestFrame])
      }
    }
  }, [frames, isRecording, recordedFrames])

  // Scarica CSV
  const downloadCSV = () => {
    if (recordedFrames.length === 0) {
      alert('Nessun dato registrato')
      return
    }

    let csv = 'timestamp,frame_count,sensor_id'
    selectedJoints.forEach(joint => {
      csv += `,${joint}_x,${joint}_y,${joint}_z`
    })
    csv += '\n'

    recordedFrames.forEach(frame => {
      csv += `${frame.timestamp},${frame.frame_count},${frame.sensor_id}`
      selectedJoints.forEach(joint => {
        const pos = frame.joints[joint] || [0, 0, 0]
        csv += `,${pos[0]},${pos[1]},${pos[2]}`
      })
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
    recordedCount: recordedFrames.length
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Mocap Telemetry Dashboard</h1>
        <p className="text-gray-400">Real-time motion capture visualization</p>
      </div>

      {/* Status Connection */}
      <div className="mb-6 flex items-center gap-3">
        <span className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
        <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
          {isConnected ? '✓ Connected to Backend' : '✗ Disconnected'}
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
            min="1"
            max="200"
            value={samplingFrequency}
            onChange={(e) => setSamplingFrequency(Math.max(1, parseInt(e.target.value) || 30))}
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
        
        <div className="flex gap-4 mb-6">
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

      {/* Debug Info */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 text-gray-400 text-xs font-mono">
        <p>Frames in buffer: {frames.length}</p>
        <p>Frames recorded: {recordedFrames.length}</p>
        <p>Sampling frequency: {samplingFrequency} Hz</p>
      </div>
    </div>
  )
}
