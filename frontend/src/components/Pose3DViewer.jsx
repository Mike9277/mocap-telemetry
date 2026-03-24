/**
 * Pose3DViewer.jsx - Simple 3D Stick Figure
 */

import React, { useEffect, useRef } from 'react'

// MediaPipe skeleton connections - left (blue), right (red)
const BONES = [
  // Torso - left to right (mixed)
  [11, 12], // shoulders
  [11, 23], // left shoulder to left hip
  [12, 24], // right shoulder to right hip
  [23, 24], // hips
  // Left arm
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  // Right arm  
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  // Left leg
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // Right leg
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
]

// MediaPipe landmark names in order (0-32)
const LANDMARKS = [
  "nose",                    // 0
  "left_eye_inner",         // 1
  "left_eye",               // 2
  "left_eye_outer",         // 3
  "right_eye_inner",        // 4
  "right_eye",              // 5
  "right_eye_outer",        // 6
  "left_ear",               // 7
  "right_ear",              // 8
  "mouth_left",             // 9
  "mouth_right",            // 10
  "left_shoulder",          // 11
  "right_shoulder",         // 12
  "left_elbow",             // 13
  "right_elbow",            // 14
  "left_wrist",             // 15
  "right_wrist",            // 16
  "left_pinky",             // 17
  "right_pinky",            // 18
  "left_index",             // 19
  "right_index",            // 20
  "left_thumb",             // 21
  "right_thumb",            // 22
  "left_hip",              // 23
  "right_hip",             // 24
  "left_knee",             // 25
  "right_knee",            // 26
  "left_ankle",           // 27
  "right_ankle",           // 28
  "left_heel",             // 29
  "right_heel",            // 30
  "left_foot_index",       // 31
  "right_foot_index",      // 32
]

// Check if landmark is from the left side
function isLeftSide(idx) {
  // Face: 1,2,3,7,9 are left (odd except 7)
  // Body: 11,13,15,17,19,21,23,25,27,29,31 are left
  const leftIndices = [1, 2, 3, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31]
  return leftIndices.includes(idx)
}

export function Pose3DViewer({ poseData, width = 400, height = 320 }) {
  const canvasRef = useRef(null)
  
  // View state
  const view = useRef({ rotX: 0, rotY: 0, zoom: 1 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  
  // Mouse handlers
  const handleMouseDown = function(e) {
    dragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
  }
  
  const handleMouseMove = function(e) {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    view.current.rotY = view.current.rotY + dx * 0.01
    view.current.rotX = Math.max(-0.5, Math.min(0.5, view.current.rotX + dy * 0.01))
    lastPos.current = { x: e.clientX, y: e.clientY }
  }
  
  const handleMouseUp = function() { 
    dragging.current = false 
  }
  
  const handleWheel = function(e) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    view.current.zoom = Math.max(0.3, Math.min(3, view.current.zoom * delta))
  }
  
  const reset = function() {
    view.current = { rotX: 0, rotY: 0, zoom: 1 }
  }
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    let animId
    
    const render = function() {
      // Clear
      ctx.fillStyle = '#0a0a15'
      ctx.fillRect(0, 0, width, height)
      
      // Get keypoints
      let kp = null
      if (poseData && typeof poseData === 'object') {
        kp = poseData.keypoints || poseData.keypoints_3d
      }
      
      if (!kp || typeof kp !== 'object') {
        ctx.fillStyle = '#666'
        ctx.font = '18px Arial'
        ctx.textAlign = 'center'
        ctx.fillText('Waiting for pose...', width/2, height/2)
        animId = requestAnimationFrame(render)
        return
      }
      
      const rotX = view.current.rotX
      const rotY = view.current.rotY
      const zoom = view.current.zoom
      
      // Get landmark position
      const getPos = function(idx) {
        const name = LANDMARKS[idx]
        if (!name || !kp[name]) return null
        return {
          x: kp[name].x || 0,
          y: kp[name].y || 0,
          z: kp[name].z || 0
        }
      }
      
      // 3D project
      const project = function(x, y, z) {
        // Center around hips
        const leftHip = getPos(23)
        const rightHip = getPos(24)
        
        let cx = 0.5, cy = 0.5
        if (leftHip && rightHip) {
          cx = (leftHip.x + rightHip.x) / 2
          cy = (leftHip.y + rightHip.y) / 2
        } else if (leftHip) {
          cx = leftHip.x
          cy = leftHip.y
        } else if (rightHip) {
          cx = rightHip.x
          cy = rightHip.y
        }
        
        // Normalize and center
        const px = (x - cx) * 2
        const py = (y - cy) * 2
        const pz = (z || 0) * 2
        
        // Rotate
        let x1 = px * Math.cos(rotY) - pz * Math.sin(rotY)
        let z1 = px * Math.sin(rotY) + pz * Math.cos(rotY)
        let y2 = py * Math.cos(rotX) - z1 * Math.sin(rotX)
        
        // Project to screen (flip Y for correct orientation)
        const scale = zoom * Math.min(width, height) * 0.7
        return {
          x: width/2 + x1 * scale,
          y: height/2 + y2 * scale,
          z: z1
        }
      }
      
      // Draw bones
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      
      BONES.forEach(function(pair) {
        const i = pair[0]
        const j = pair[1]
        const p1 = getPos(i)
        const p2 = getPos(j)
        
        if (p1 && p2) {
          const pt1 = project(p1.x, p1.y, p1.z)
          const pt2 = project(p2.x, p2.y, p2.z)
          
          // Color by left/right side
          const left = isLeftSide(i)
          ctx.strokeStyle = left ? 'rgba(74, 158, 255, 0.9)' : 'rgba(255, 107, 107, 0.9)'
          
          ctx.beginPath()
          ctx.moveTo(pt1.x, pt1.y)
          ctx.lineTo(pt2.x, pt2.y)
          ctx.stroke()
        }
      })
      
      // Draw joints
      LANDMARKS.forEach(function(name, idx) {
        const p = getPos(idx)
        if (!p) return
        
        const pt = project(p.x, p.y, p.z)
        
        const left = isLeftSide(idx)
        
        // Size based on z (depth)
        const size = 4 + (pt.z || 0) * 1.5
        
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, Math.max(3, Math.min(8, size)), 0, Math.PI * 2)
        ctx.fillStyle = left ? '#4a9eff' : '#ff6b6b'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.stroke()
      })
      
      // Legend
      ctx.font = 'bold 12px Arial'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#4a9eff'
      ctx.fillText('LEFT', 10, height - 35)
      ctx.fillStyle = '#ff6b6b'
      ctx.fillText('RIGHT', 55, height - 35)
      ctx.font = '11px Arial'
      ctx.fillStyle = '#888'
      ctx.fillText('(screen perspective)', 10, height - 18)
      
      animId = requestAnimationFrame(render)
    }
    
    render()
    
    return function() { cancelAnimationFrame(animId) }
  }, [poseData, width, height])

  return (
    <div style={{ backgroundColor: '#000', border: '2px solid #4a9eff', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ backgroundColor: '#16213e', padding: '8px 12px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#4a9eff', fontWeight: 'bold', fontSize: '14px' }}>
          3D Skeleton
        </span>
        <button onClick={reset} style={{ background: '#333', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, fontSize: 11 }}>
          Reset
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: 'block', width: '100%', cursor: 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      <div style={{ padding: '8px', fontSize: 11, color: '#666', textAlign: 'center' }}>
        Drag to rotate | Scroll to zoom
      </div>
    </div>
  )
}
