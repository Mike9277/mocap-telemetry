/*
######################
#  useMocapWebSocket.js
#
# WebSocket Hook for Wholebody Motion Capture Data
# Handles body keypoints, hand keypoints, and joint angles
#
# Author: Michelangelo Guaitolini, 12.03.2026
######################
*/

import { useEffect, useState, useRef, useCallback } from 'react'

export function useMocapWebSocket(url = 'ws://localhost:8002') {
  const [frames, setFrames]           = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError]             = useState(null)
  const [poseData, setPoseData]       = useState(null)
  const [jointAngles, setJointAngles] = useState({})        // latest angles snapshot
  const [angleHistory, setAngleHistory] = useState({})      // name → [last N values]

  const HISTORY_LEN = 120
  const wsRef = useRef(null)

  useEffect(() => {
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('✓ WebSocket connected')
      setIsConnected(true)
      setError(null)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        console.log('📨 WebSocket message received:', {
          has_keypoints: !!message.keypoints,
          has_has_person: !!message.has_person,
          has_joint_angles: !!message.joint_angles,
          frame_count: message.frame_count,
          sensor_id: message.sensor_id,
        })

        // ── Traditional mocap_frame format ──────────────────────────────────
        if (message.type === 'mocap_frame') {
          console.log('  → mocap_frame format')
          setFrames(prev => [...prev, message.data].slice(-100))
          return
        }

        // ── Wholebody / YOLOv8 pose format ──────────────────────────────────
        if (message.keypoints !== undefined || message.has_person !== undefined) {
          console.log('  → Pose format (keypoints or has_person)')
          setPoseData(message)

          // Update joint angles state
          if (message.joint_angles && Object.keys(message.joint_angles).length > 0) {
            // Filter out null values (which represent NaN)
            const validAngles = {}
            for (const [name, val] of Object.entries(message.joint_angles)) {
              if (val !== null && !isNaN(val)) {
                validAngles[name] = val
              }
            }
            
            if (Object.keys(validAngles).length > 0) {
              console.log(`  → Updated ${Object.keys(validAngles).length} joint angles`)
              setJointAngles(validAngles)

              // Append each angle to its history buffer
              setAngleHistory(prev => {
                const updated = { ...prev }
                for (const [name, val] of Object.entries(validAngles)) {
                  const arr = updated[name] ? [...updated[name]] : []
                  arr.push(val)
                  if (arr.length > HISTORY_LEN) arr.shift()
                  updated[name] = arr
                }
                return updated
              })
            }
          }

          setFrames(prev => [...prev, message].slice(-100))
        } else {
          console.warn('⚠️ Message does not match any format:', Object.keys(message))
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err)
      }
    }

    ws.onerror = () => {
      setError('WebSocket connection unavailable')
      setIsConnected(false)
    }

    ws.onclose = () => {
      setIsConnected(false)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [url])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getLatestFrame = useCallback(
    () => (frames.length > 0 ? frames[frames.length - 1] : null),
    [frames]
  )

  const getJointHistory = useCallback(
    (joint) =>
      frames
        .filter(f => f.joints && f.joints[joint])
        .map(f => ({
          timestamp: f.timestamp,
          x: f.joints[joint][0],
          y: f.joints[joint][1],
          z: f.joints[joint][2],
        })),
    [frames]
  )

  /**
   * Get the angle history array for a specific joint name.
   * Returns an array of up to HISTORY_LEN degree values.
   */
  const getAngleHistory = useCallback(
    (angleName) => angleHistory[angleName] || [],
    [angleHistory]
  )

  return {
    frames,
    isConnected,
    error,
    poseData,
    jointAngles,
    angleHistory,
    getLatestFrame,
    getJointHistory,
    getAngleHistory,
  }
}