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

import React, { useState, useEffect } from 'react'

export function PoseVisualization({ poseData, width = 640, height = 480 }) {
  const [videoSrc, setVideoSrc] = useState(null)

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

  return (
    <div className="w-full bg-black rounded-lg overflow-hidden border border-green-500">
      <div className="flex flex-col">
        {/* Video Frame */}
        <div className="relative bg-black flex items-center justify-center" style={{ aspectRatio: `${width}/${height}` }}>
          {videoSrc ? (
            <>
              <img 
                src={videoSrc}
                alt="Pose Detection Live"
                className="w-full h-full object-contain"
              />
              {/* Info Overlay */}
              <div className="absolute top-2 left-2 bg-black bg-opacity-60 text-green-400 px-3 py-1 rounded text-xs font-mono">
                Frame: {poseData?.frame_count || 0} | {poseData?.has_person ? '✓ Person' : '✗ No Person'}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-96 bg-gray-900 text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">📷 Waiting for video stream...</p>
                <p className="text-sm text-gray-600">Make sure the sensor is running</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
