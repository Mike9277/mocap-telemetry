import { useEffect, useState, useRef, useCallback } from 'react'

export function useMocapWebSocket(url = 'ws://localhost:8002') {
  const [frames, setFrames] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const [poseData, setPoseData] = useState(null)
  const wsRef = useRef(null)

  useEffect(() => {
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('✓ WebSocket connesso')
      setIsConnected(true)
      setError(null)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        
        // Supporta sia il formato mocap_frame che il nuovo formato pose detection
        if (message.type === 'mocap_frame') {
          setFrames(prev => {
            const updated = [...prev, message.data]
            return updated.slice(-100)
          })
        } else if (message.keypoints || message.has_person !== undefined) {
          // Nuovo formato YOLOv8 Pose Detection
          setPoseData(message)
          
          // Debug: mostra se il video è presente
          if (message.video) {
            console.log(`✓ Video ricevuto (${message.video.length} bytes), frame: ${message.frame_count}`)
          } else {
            console.warn(`⚠️ Video NON presente nel frame ${message.frame_count}`)
          }
          
          setFrames(prev => {
            const updated = [...prev, message]
            return updated.slice(-100)
          })
        }
      } catch (err) {
        console.error('Errore parsing WebSocket:', err)
      }
    }

    ws.onerror = (event) => {
      console.error('✗ WebSocket error:', event)
      setError('Connessione WebSocket non disponibile')
      setIsConnected(false)
    }

    ws.onclose = () => {
      console.log('✗ WebSocket chiuso')
      setIsConnected(false)
    }

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
  }, [url])

  const getLatestFrame = useCallback(() => {
    return frames.length > 0 ? frames[frames.length - 1] : null
  }, [frames])

  const getJointHistory = useCallback((joint) => {
    return frames
      .filter(f => f.joints && f.joints[joint])
      .map(f => ({
        timestamp: f.timestamp,
        x: f.joints[joint][0],
        y: f.joints[joint][1],
        z: f.joints[joint][2]
      }))
  }, [frames])

  return {
    frames,
    isConnected,
    error,
    poseData,
    getLatestFrame,
    getJointHistory
  }
}
