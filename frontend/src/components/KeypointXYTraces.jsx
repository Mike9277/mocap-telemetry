import React, { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export function KeypointXYTraces({ frames, selectedKeypoints = ["nose", "left_wrist", "right_wrist"] }) {
  const data = useMemo(() => {
    if (!frames || frames.length === 0) return []

    // Crea dati per ogni frame mostrato
    return frames.map((frame, idx) => {
      const point = { index: idx }
      
      selectedKeypoints.forEach(kpt_name => {
        if (frame.keypoints && frame.keypoints[kpt_name]) {
          const kpt = frame.keypoints[kpt_name]
          point[`${kpt_name}_x`] = parseFloat((kpt.x * 100).toFixed(1))  // 0-100% per visualizzazione
          point[`${kpt_name}_y`] = parseFloat((kpt.y * 100).toFixed(1))
        }
      })
      
      return point
    })
  }, [frames, selectedKeypoints])

  const COLORS = [
    '#00ff00', '#ff00ff', '#00ffff', '#ffff00', '#ff0080',
    '#0080ff', '#ff8000', '#80ff00', '#ff0000', '#00ff80'
  ]

  if (!frames || frames.length === 0) {
    return (
      <div className="w-full h-80 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center text-gray-500">
        No frame data available
      </div>
    )
  }

  return (
    <div className="w-full bg-gray-900 rounded-lg border border-gray-700 p-4">
      <h3 className="text-green-400 font-semibold mb-4">2D Coordinates (X, Y %)</h3>
      
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis 
            dataKey="index" 
            stroke="#666"
            label={{ value: 'Frame Index', position: 'insideBottomRight', offset: -5 }}
          />
          <YAxis 
            stroke="#666"
            domain={[0, 100]}
            label={{ value: 'Normalized Position (%)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #4b5563' }}
            labelStyle={{ color: '#9ca3af' }}
          />
          <Legend />
          
          {selectedKeypoints.map((kpt_name, idx) => (
            <React.Fragment key={kpt_name}>
              <Line
                type="monotone"
                dataKey={`${kpt_name}_x`}
                stroke={COLORS[idx % COLORS.length]}
                dot={false}
                isAnimationActive={false}
                strokeWidth={2}
                name={`${kpt_name} X`}
                opacity={0.8}
              />
              <Line
                type="monotone"
                dataKey={`${kpt_name}_y`}
                stroke={COLORS[idx % COLORS.length]}
                dot={false}
                isAnimationActive={false}
                strokeWidth={2}
                strokeDasharray="5 5"
                name={`${kpt_name} Y`}
                opacity={0.6}
              />
            </React.Fragment>
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Legend Info */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        {selectedKeypoints.map((kpt_name, idx) => (
          <div key={kpt_name} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
            />
            <span className="text-gray-300">{kpt_name}</span>
          </div>
        ))}
      </div>
      <p className="text-gray-500 text-xs mt-2">Solid line = X axis, Dashed line = Y axis</p>
    </div>
  )
}
