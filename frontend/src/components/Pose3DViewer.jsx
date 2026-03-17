/**
 * Pose3DViewer.jsx
 * 3D Head visualization with clear left/right orientation
 * 
 * In webcam (mirrored): 
 * - Person's RIGHT eye appears on LEFT side of screen
 * - Person's LEFT eye appears on RIGHT side of screen
 * 
 * Coordinate system:
 * - X: toward viewer (nose direction)
 * - Y: person's right side (screen left = person's right = right eye)
 * - Z: up
 */

import React, { useState, useEffect, useRef } from 'react'

function lerp(a, b, t) {
  return a + (b - a) * t
}

export function Pose3DViewer({ poseData, width = 400, height = 400 }) {
  const canvasRef = useRef(null)
  
  const [rotation, setRotation] = useState({ x: 0, y: 0 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(280)
  
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 })
  const [autoRotate, setAutoRotate] = useState(false)
  
  const autoRotateRef = useRef(0)
  const smoothedRef = useRef({})

  const getKeypoints = () => {
    if (!poseData) return null
    return poseData.keypoints || poseData.keypoints_3d || null
  }

  // In webcam view (mirrored):
  // - right_eye is on LEFT side of screen (person's right eye)
  // - left_eye is on RIGHT side of screen (person's left eye)
  const getFaceCenter = (kp) => {
    const leftEye = kp?.left_eye   // Person's left = screen right
    const rightEye = kp?.right_eye  // Person's right = screen left
    
    if (leftEye && rightEye && 
        leftEye.confidence > 0.2 && rightEye.confidence > 0.2) {
      return {
        x: (leftEye.x + rightEye.x) / 2,
        y: (leftEye.y + rightEye.y) / 2,
        z: ((leftEye.z || 0) + (rightEye.z || 0)) / 2,
      }
    }
    return null
  }

  // Transform: align to webcam view
  // X = toward viewer, Y = person's right, Z = up
  const transformCoords = (kp) => {
    const faceCenter = getFaceCenter(kp)
    if (!faceCenter) return kp
    
    const transformed = {}
    
    for (const [name, pt] of Object.entries(kp)) {
      if (!pt || pt.confidence < 0.2) continue
      
      const relX = (pt.x || 0) - faceCenter.x
      const relY = (pt.y || 0) - faceCenter.y
      const relZ = (pt.z || 0) - (faceCenter.z || 0)
      
      // MediaPipe: x=right, y=down, z=depth
      // Webcam mirrored: 
      // - Screen right = person's LEFT = left_eye
      // - Screen left = person's RIGHT = right_eye
      // 
      // Transform: X=nose(depth), Y=horizontal, Z=vertical
      transformed[name] = {
        x: relZ,        // X = depth toward viewer
        y: -relX,       // Y = person's right (screen left = right eye)
        z: -relY,       // Z = up
        confidence: pt.confidence,
      }
    }
    
    return transformed
  }

  const smoothKeypoints = (kp, alpha = 0.4) => {
    const smoothed = {}
    
    for (const [name, pt] of Object.entries(kp)) {
      const prev = smoothedRef.current[name]
      
      if (!prev) {
        smoothed[name] = { ...pt }
      } else {
        smoothed[name] = {
          x: lerp(prev.x, pt.x, alpha),
          y: lerp(prev.y, pt.y, alpha),
          z: lerp(prev.z, pt.z, alpha),
          confidence: pt.confidence,
        }
      }
    }
    
    smoothedRef.current = smoothed
    return smoothed
  }

  const project3D = (x, y, z, rotX, rotY, scale, panX, panY) => {
    let x1 = x * Math.cos(rotY) - z * Math.sin(rotY)
    let z1 = x * Math.sin(rotY) + z * Math.cos(rotY)
    
    let y2 = y * Math.cos(rotX) - z1 * Math.sin(rotX)
    let z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX)
    
    const displayScale = scale * Math.min(width, height) * 0.7
    
    return {
      x: width / 2 + x1 * displayScale + panX,
      y: height / 2 + y2 * displayScale + panY,
      z: z2,
    }
  }

  // Draw oval head
  const drawHeadOval = (ctx, centerX, centerY, w, h) => {
    ctx.beginPath()
    ctx.ellipse(centerX, centerY, w, h, 0, 0, 2 * Math.PI)
    ctx.strokeStyle = 'rgba(80, 140, 220, 0.7)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = 'rgba(40, 70, 110, 0.2)'
    ctx.fill()
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#0a0a12'
    ctx.fillRect(0, 0, width, height)

    const kp = getKeypoints()
    if (!kp) {
      ctx.fillStyle = '#555'
      ctx.font = '16px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('Waiting for pose...', width / 2, height / 2)
      return
    }

    // Transform and smooth
    const transformed = transformCoords(kp)
    const smoothed = smoothKeypoints(transformed, 0.4)
    
    const scale = zoom / 100
    const panX = pan.x
    const panY = pan.y
    
    // Project points
    const projected = {}
    for (const [name, pt] of Object.entries(smoothed)) {
      if (!pt || pt.confidence < 0.2) continue
      projected[name] = project3D(pt.x, pt.y, pt.z, rotation.x, rotation.y, scale, panX, panY)
      projected[name].z = pt.z
    }

    // Get eye positions for head oval
    // In screen coords: left_eye is on RIGHT, right_eye is on LEFT
    const screenLeftEye = projected.left_eye    // Person's left = screen right
    const screenRightEye = projected.right_eye  // Person's right = screen left
    
    if (screenLeftEye && screenRightEye) {
      const cx = (screenLeftEye.x + screenRightEye.x) / 2
      const cy = (screenLeftEye.y + screenRightEye.y) / 2
      const eyeDist = Math.abs(screenRightEye.x - screenLeftEye.x)
      
      drawHeadOval(ctx, cx, cy, eyeDist * 1.3, eyeDist * 1.6)
    }

    // Define what to draw with colors
    // Screen LEFT = person's RIGHT = right_eye
    // Screen RIGHT = person's LEFT = left_eye
    const landmarks = [
      { name: 'nose', color: '#ff4757', label: 'NOSE' },
      { name: 'right_eye', color: '#2ed573', label: 'R'},  // Screen left = person right
      { name: 'left_eye', color: '#ffa502', label: 'L'},   // Screen right = person left
      { name: 'right_ear', color: '#2ed573', label: '' },  // Person's right ear
      { name: 'left_ear', color: '#ffa502', label: '' },    // Person's left ear
      { name: 'mouth_left', color: '#a55eea', label: '' },
      { name: 'mouth_right', color: '#a55eea', label: '' },
    ]
    
    landmarks.forEach(({ name, color, label }) => {
      const pt = projected[name]
      if (!pt) return
      
      // Draw point
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 8, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
      
      // Glow
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 16, 0, 2 * Math.PI)
      const glow = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 16)
      glow.addColorStop(0, color.replace(')', ', 0.5)').replace('#', 'rgba(').replace(/([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i, (m, r, g, b) => `${parseInt(r,16)}, ${parseInt(g,16)}, ${parseInt(b,16)}`))
      glow.addColorStop(1, 'transparent')
      ctx.fillStyle = glow
      ctx.fill()
      
      // Label
      if (label) {
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 14px Arial'
        ctx.textAlign = 'center'
        ctx.fillText(label, pt.x, pt.y - 15)
      }
    })

    // Draw axes
    const origin = project3D(0, 0, 0, rotation.x, rotation.y, scale * 0.18, panX, panY)
    const xEnd = project3D(0.12, 0, 0, rotation.x, rotation.y, scale * 0.18, panX, panY)
    const yEnd = project3D(0, 0.12, 0, rotation.x, rotation.y, scale * 0.18, panX, panY)
    const zEnd = project3D(0, 0, 0.12, rotation.x, rotation.y, scale * 0.18, panX, panY)
    
    ctx.lineWidth = 3
    
    // X (nose toward viewer) - red
    ctx.strokeStyle = 'rgba(255, 71, 87, 0.9)'
    ctx.beginPath()
    ctx.moveTo(origin.x, origin.y)
    ctx.lineTo(xEnd.x, xEnd.y)
    ctx.stroke()
    
    // Y (person's right) - green
    ctx.strokeStyle = 'rgba(46, 213, 115, 0.9)'
    ctx.beginPath()
    ctx.moveTo(origin.x, origin.y)
    ctx.lineTo(yEnd.x, yEnd.y)
    ctx.stroke()
    
    // Z (up) - blue
    ctx.strokeStyle = 'rgba(30, 144, 255, 0.9)'
    ctx.beginPath()
    ctx.moveTo(origin.x, origin.y)
    ctx.lineTo(zEnd.x, zEnd.y)
    ctx.stroke()
    
    // Labels
    ctx.font = 'bold 12px Arial'
    ctx.fillStyle = 'rgba(255, 71, 87, 0.9)'
    ctx.fillText('X: nose', xEnd.x + 5, xEnd.y)
    ctx.fillStyle = 'rgba(46, 213, 115, 0.9)'
    ctx.fillText('Y: right', yEnd.x + 5, yEnd.y)
    ctx.fillStyle = 'rgba(30, 144, 255, 0.9)'
    ctx.fillText('Z: up', zEnd.x + 5, zEnd.y - 5)
    
    // Legend
    ctx.font = '11px Arial'
    ctx.fillStyle = 'rgba(46, 213, 115, 0.9)'
    ctx.fillText('R = right eye (screen LEFT)', 60, height - 40)
    ctx.fillStyle = 'rgba(255, 165, 2, 0.9)'
    ctx.fillText('L = left eye (screen RIGHT)', 60, height - 22)

  }, [poseData, rotation, pan, zoom])

  useEffect(() => {
    let animId
    
    const animate = () => {
      if (autoRotate && !isDragging && !isPanning) {
        autoRotateRef.current += 0.004
        setRotation(prev => ({ ...prev, y: autoRotateRef.current }))
      }
      animId = requestAnimationFrame(animate)
    }
    
    animate()
    return () => cancelAnimationFrame(animId)
  }, [autoRotate, isDragging, isPanning])

  const handleMouseDown = (e) => {
    if (e.shiftKey) setIsPanning(true)
    else setIsDragging(true)
    setAutoRotate(false)
    setLastPos({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e) => {
    if (!isDragging && !isPanning) return
    
    const dx = e.clientX - lastPos.x
    const dy = e.clientY - lastPos.y
    
    if (isDragging) {
      setRotation(prev => ({
        x: Math.max(-1.5, Math.min(1.5, prev.x + dy * 0.008)),
        y: prev.y + dx * 0.008
      }))
    } else {
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }))
    }
    
    setLastPos({ x: e.clientX, y: e.clientY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsPanning(false)
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -25 : 25
    setZoom(prev => Math.max(80, Math.min(600, prev + delta)))
  }

  const reset = () => {
    setRotation({ x: 0, y: 0 })
    setPan({ x: 0, y: 0 })
    setZoom(280)
  }

  const kp = getKeypoints()

  return (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden border border-blue-500">
      <div className="flex justify-between items-center px-3 py-2 bg-gray-800 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-blue-400">3D Head Viewer</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`text-xs px-2 py-0.5 rounded ${autoRotate ? 'bg-green-800 text-green-300' : 'bg-gray-700 text-gray-400'}`}
          >
            Auto
          </button>
          <button onClick={reset} className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300">
            Reset
          </button>
        </div>
      </div>
      
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full h-auto cursor-move"
          style={{ aspectRatio: `${width}/${height}` }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
        
        <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-xs font-mono p-2 rounded text-gray-400">
          <div>Drag to rotate</div>
          <div>Shift+Drag to pan</div>
          <div>Scroll to zoom</div>
        </div>

        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <button onClick={() => setZoom(prev => Math.min(600, prev + 40))} className="bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">+</button>
          <div className="bg-black bg-opacity-70 text-xs font-mono px-2 py-1 rounded text-gray-400 text-center">{zoom}%</div>
          <button onClick={() => setZoom(prev => Math.max(80, prev - 40))} className="bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">-</button>
        </div>

        <div className="absolute top-2 left-2">
          <span className={`text-xs px-2 py-0.5 rounded ${kp ? 'bg-green-900 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
            {kp ? 'Active' : 'No Data'}
          </span>
        </div>
      </div>
    </div>
  )
}
