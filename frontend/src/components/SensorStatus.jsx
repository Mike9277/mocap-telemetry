import React, { useState, useEffect } from 'react'
import axios from 'axios'

export function SensorStatus() {
  const [sensors, setSensors] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSensors = async () => {
      try {
        const response = await axios.get('/api/sensors')
        setSensors(response.data.sensors || {})
        setLoading(false)
      } catch (err) {
        console.error('Errore fetch sensori:', err)
        setLoading(false)
      }
    }

    fetchSensors()
    const interval = setInterval(fetchSensors, 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return <div className="text-gray-400">Caricamento sensori...</div>
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-4">
      <h2 className="text-xl font-bold mb-4">📡 Stato Sensori</h2>
      
      {Object.entries(sensors).length === 0 ? (
        <div className="text-gray-500 text-center py-8">
          Nessun sensore connesso. Avvia il sensor simulator per iniziare.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(sensors).map(([sensorId, status]) => (
            <div key={sensorId} className="bg-gray-700 rounded p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">{sensorId}</h3>
                <span className={`w-3 h-3 rounded-full inline-block ${
                  status.is_online ? 'bg-green-500' : 'bg-red-500'
                }`}></span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Stato:</span>
                  <span className={status.is_online ? 'text-green-400' : 'text-red-400'}>
                    {status.is_online ? '🟢 Online' : '🔴 Offline'}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-400">Frame ricevuti:</span>
                  <span className="text-blue-400">{status.frame_count}</span>
                </div>
                
                {status.last_frame && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Frequenza:</span>
                    <span className="text-blue-400">30 Hz</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
