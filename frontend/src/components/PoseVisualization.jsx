/*
######################
#  PoseVisualization.jsx
#
# Component for displaying live video feed from pose detection
# Shows real-time skeleton overlay and person detection status
#
# Author: Michelangelo Guaitolini, 11.03.2026
######################
*/

import React, { useState, useEffect, useRef } from 'react'

export function PoseVisualization({ poseData, width = 640, height = 480 }) {
  const [videoSrc, setVideoSrc] = useState(null)
  const overlayCanvasRef = useRef(null)
  
  // Use source frame size when available to align pixel coordinates
  const srcW = poseData?.image_shape?.[1] ?? width
  const srcH = poseData?.image_shape?.[0] ?? height

  // When we receive a new frame with video, display it
  useEffect(() => {
    if (poseData && poseData.video) {
      // Create data URL from base64 image
      const dataUrl = `data:image/jpeg;base64,${poseData.video}`
      setVideoSrc(dataUrl)
      console.log(`✓ PoseVisualization: video set (${poseData.video.length} bytes)`)
    } else if (poseData) {
      console.warn(`⚠️ PoseVisualization: poseData exists but no video field`)
      console.log('poseData keys:', Object.keys(poseData))
    }
  }, [poseData?.video])

  // Draw skeleton on overlay canvas when video is playing
  useEffect(() => {
    if (!overlayCanvasRef.current || !poseData) return

    const canvas = overlayCanvasRef.current
    const ctx = canvas.getContext('2d')

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const keypoints = poseData.keypoints || {}

    // Define skeleton connections with side info
    // Format: [startKey, endKey, side] where side is 'left', 'right', or 'center'
    const connections = [
      // Face - center (green)
      ['nose', 'left_eye_inner', 'center'], ['nose', 'right_eye_inner', 'center'],
      ['left_eye_inner', 'left_eye', 'center'], ['left_eye', 'left_eye_outer', 'center'],
      ['right_eye_inner', 'right_eye', 'center'], ['right_eye', 'right_eye_outer', 'center'],
      ['left_eye_outer', 'left_ear', 'left'], ['right_eye_outer', 'right_ear', 'right'],
      // Shoulders - center
      ['left_shoulder', 'right_shoulder', 'center'],
      // Arms - left (RED)
      ['left_shoulder', 'left_elbow', 'left'], ['left_elbow', 'left_wrist', 'left'],
      ['left_wrist', 'left_pinky', 'left'], ['left_wrist', 'left_index', 'left'], ['left_wrist', 'left_thumb', 'left'],
      // Arms - right (BLUE)
      ['right_shoulder', 'right_elbow', 'right'], ['right_elbow', 'right_wrist', 'right'],
      ['right_wrist', 'right_pinky', 'right'], ['right_wrist', 'right_index', 'right'], ['right_wrist', 'right_thumb', 'right'],
      // Torso - center
      ['left_shoulder', 'left_hip', 'left'], ['right_shoulder', 'right_hip', 'right'],
      ['left_hip', 'right_hip', 'center'],
      // Legs - left (RED)
      ['left_hip', 'left_knee', 'left'], ['left_knee', 'left_ankle', 'left'],
      ['left_ankle', 'left_heel', 'left'], ['left_ankle', 'left_foot_index', 'left'],
      // Legs - right (BLUE)
      ['right_hip', 'right_knee', 'right'], ['right_knee', 'right_ankle', 'right'],
      ['right_ankle', 'right_heel', 'right'], ['right_ankle', 'right_foot_index', 'right'],
    ]

    // Draw connections with color based on side
    for (const [start, end, side] of connections) {
      const s = keypoints[start]
      const e = keypoints[end]
      if (s && e && s.confidence > 0.3 && e.confidence > 0.3) {
        // Set color based on side
        if (side === 'left') {
          ctx.strokeStyle = '#ff4444' // RED for left
        } else if (side === 'right') {
          ctx.strokeStyle = '#4444ff' // BLUE for right
        } else {
          ctx.strokeStyle = '#00ff00' // GREEN for center
        }
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(s.x_pixel, s.y_pixel)
        ctx.lineTo(e.x_pixel, e.y_pixel)
        ctx.stroke()
      }
    }

    // Draw keypoints with color based on side
    for (const [name, kpt] of Object.entries(keypoints)) {
      if (kpt.confidence > 0.3) {
        // Determine side from keypoint name
        let color = '#00ff00' // GREEN for center
        if (name.includes('left_')) {
          color = '#ff4444' // RED for left
        } else if (name.includes('right_')) {
          color = '#4444ff' // BLUE for right
        } else if (name === 'nose' || name.includes('eye') || name.includes('ear') || name.includes('mouth')) {
          color = '#00ff00' // GREEN for face
        }
        
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(kpt.x_pixel, kpt.y_pixel, 4, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
  }, [poseData])

  // Draw skeleton on canvas (no video mode)
  const canvasRef = useRef(null)
  
  useEffect(() => {
    if (!canvasRef.current || !poseData || videoSrc) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    // Clear canvas
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Draw keypoints
    if (poseData.keypoints) {
      const keypoints = poseData.keypoints
      
      // Define skeleton connections with side info
      const connections = [
        // Face - center (green)
        ['nose', 'left_eye_inner', 'center'], ['nose', 'right_eye_inner', 'center'],
        ['left_eye_inner', 'left_eye', 'center'], ['left_eye', 'left_eye_outer', 'center'],
        ['right_eye_inner', 'right_eye', 'center'], ['right_eye', 'right_eye_outer', 'center'],
        ['left_eye_outer', 'left_ear', 'left'], ['right_eye_outer', 'right_ear', 'right'],
        // Shoulders - center
        ['left_shoulder', 'right_shoulder', 'center'],
        // Arms - left (RED)
        ['left_shoulder', 'left_elbow', 'left'], ['left_elbow', 'left_wrist', 'left'],
        ['left_wrist', 'left_pinky', 'left'], ['left_wrist', 'left_index', 'left'], ['left_wrist', 'left_thumb', 'left'],
        // Arms - right (BLUE)
        ['right_shoulder', 'right_elbow', 'right'], ['right_elbow', 'right_wrist', 'right'],
        ['right_wrist', 'right_pinky', 'right'], ['right_wrist', 'right_index', 'right'], ['right_wrist', 'right_thumb', 'right'],
        // Torso - center
        ['left_shoulder', 'left_hip', 'left'], ['right_shoulder', 'right_hip', 'right'],
        ['left_hip', 'right_hip', 'center'],
        // Legs - left (RED)
        ['left_hip', 'left_knee', 'left'], ['left_knee', 'left_ankle', 'left'],
        ['left_ankle', 'left_heel', 'left'], ['left_ankle', 'left_foot_index', 'left'],
        // Legs - right (BLUE)
        ['right_hip', 'right_knee', 'right'], ['right_knee', 'right_ankle', 'right'],
        ['right_ankle', 'right_heel', 'right'], ['right_ankle', 'right_foot_index', 'right'],
      ]
      
      // Draw connections with color based on side
      for (const [start, end, side] of connections) {
        const s = keypoints[start]
        const e = keypoints[end]
        if (s && e && s.confidence > 0.3 && e.confidence > 0.3) {
          if (side === 'left') {
            ctx.strokeStyle = '#ff4444' // RED
          } else if (side === 'right') {
            ctx.strokeStyle = '#4444ff' // BLUE
          } else {
            ctx.strokeStyle = '#00ff00' // GREEN
          }
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(s.x_pixel, s.y_pixel)
          ctx.lineTo(e.x_pixel, e.y_pixel)
          ctx.stroke()
        }
      }
      
      // Draw keypoints with color based on side
      for (const [name, kpt] of Object.entries(keypoints)) {
        if (kpt.confidence > 0.3) {
          let color = '#00ff00' // GREEN
          if (name.includes('left_')) {
            color = '#ff4444' // RED
          } else if (name.includes('right_')) {
            color = '#4444ff' // BLUE
          } else if (name === 'nose' || name.includes('eye') || name.includes('ear') || name.includes('mouth')) {
            color = '#00ff00' // GREEN
          }
          
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(kpt.x_pixel, kpt.y_pixel, 4, 0, 2 * Math.PI)
          ctx.fill()
        }
      }
    }
  }, [poseData, videoSrc])

  return (
    <div className="w-full bg-black rounded-lg overflow-hidden border border-green-500">
      <div className="flex flex-col">
        {/* Canvas or Video Frame */}
        <div className="relative bg-black flex items-center justify-center" style={{ aspectRatio: `${srcW}/${srcH}` }}>
          {videoSrc ? (
            <>
              <img 
                src={videoSrc}
                alt="Pose Detection Live"
                className="w-full h-full object-contain"
                style={{ aspectRatio: `${srcW}/${srcH}` }}
              />
              {/* Overlay canvas for drawing skeleton on video */}
              <canvas
                ref={overlayCanvasRef}
                width={srcW}
                height={srcH}
                className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
                style={{ aspectRatio: `${srcW}/${srcH}` }}
              />
              {/* Info Overlay */}
              <div className="absolute top-2 left-2 bg-black bg-opacity-60 text-green-400 px-3 py-1 rounded text-xs font-mono">
                Frame: {poseData?.frame_count || 0} | {poseData?.has_person ? '✓ Person' : '✗ No Person'}
              </div>
              {/* Legend */}
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-xs font-mono p-2 rounded">
                <div className="text-[#ff4444]">● Left (RED)</div>
                <div className="text-[#4444ff]">● Right (BLUE)</div>
                <div className="text-[#00ff00]">● Center (GREEN)</div>
              </div>
            </>
          ) : poseData?.keypoints ? (
            <>
              <canvas
                ref={canvasRef}
                width={srcW}
                height={srcH}
                className="w-full h-auto"
              />
              {/* Info Overlay */}
              <div className="absolute top-2 left-2 bg-black bg-opacity-60 text-green-400 px-3 py-1 rounded text-xs font-mono">
                Frame: {poseData?.frame_count || 0} | {poseData?.has_person ? '✓ Person' : '✗ No Person'}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-96 bg-gray-900 text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">📷 Waiting for data stream...</p>
                <p className="text-sm text-gray-600">Make sure the sensor is running</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
