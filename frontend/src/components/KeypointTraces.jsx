import React, { useMemo } from 'react'

export function KeypointTraces({ frames, selectedKeypoints = ["nose", "left_wrist", "right_wrist"], width = 800, height = 400 }) {
  const KEYPOINT_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle"
  ]

  // Colori diversi per ogni keypoint
  const COLORS = [
    '#00ff00', '#ff00ff', '#00ffff', '#ffff00', '#ff0080',
    '#0080ff', '#ff8000', '#80ff00', '#ff0000', '#00ff80'
  ]

  const data = useMemo(() => {
    if (!frames || frames.length === 0) return {}

    const result = {}
    
    selectedKeypoints.forEach((kpt_name, idx) => {
      const traces = frames
        .filter(f => f.keypoints && f.keypoints[kpt_name])
        .map((f, i) => ({
          index: i,
          x: f.keypoints[kpt_name].x,  // 0-1 normalized
          y: f.keypoints[kpt_name].y,  // 0-1 normalized
          confidence: f.keypoints[kpt_name].confidence
        }))

      result[kpt_name] = {
        traces,
        color: COLORS[idx % COLORS.length]
      }
    })

    return result
  }, [frames, selectedKeypoints])

  if (!frames || frames.length === 0) {
    return (
      <div className="w-full h-96 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center text-gray-500">
        No frame data available
      </div>
    )
  }

  const padding = 40
  const graphWidth = width - 2 * padding
  const graphHeight = height - 2 * padding

  return (
    <div className="w-full bg-gray-900 rounded-lg border border-gray-700 p-4">
      <h3 className="text-green-400 font-semibold mb-2">2D Keypoint Traces (X, Y Normalized)</h3>
      
      <svg width={width} height={height} className="border border-gray-700 rounded bg-black">
        {/* Grid */}
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#333" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#grid)" />

        {/* Axes */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#666" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#666" strokeWidth="1" />

        {/* Axis labels */}
        <text x={width - 20} y={height - padding + 20} fill="#999" fontSize="12">X</text>
        <text x={padding - 20} y={20} fill="#999" fontSize="12">Y</text>

        {/* Grid lines and ticks */}
        {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((val, i) => (
          <g key={`grid-${i}`}>
            {/* Vertical grid */}
            <line
              x1={padding + val * graphWidth}
              y1={padding}
              x2={padding + val * graphWidth}
              y2={height - padding}
              stroke="#333"
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />
            {/* Horizontal grid */}
            <line
              x1={padding}
              y1={padding + val * graphHeight}
              x2={width - padding}
              y2={padding + val * graphHeight}
              stroke="#333"
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />
            {/* X axis tick labels */}
            <text
              x={padding + val * graphWidth}
              y={height - padding + 15}
              fill="#666"
              fontSize="11"
              textAnchor="middle"
            >
              {val.toFixed(1)}
            </text>
            {/* Y axis tick labels */}
            <text
              x={padding - 10}
              y={height - padding - val * graphHeight + 5}
              fill="#666"
              fontSize="11"
              textAnchor="end"
            >
              {val.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Plot traces */}
        {Object.entries(data).map(([kpt_name, { traces, color }]) =>
          traces.length > 0 && (
            <g key={kpt_name}>
              {/* Line trace */}
              <polyline
                points={traces
                  .map(t => `${padding + t.x * graphWidth},${height - padding - t.y * graphHeight}`)
                  .join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="2"
                opacity="0.8"
              />
              {/* Points */}
              {traces.map((t, i) => (
                <circle
                  key={`${kpt_name}-${i}`}
                  cx={padding + t.x * graphWidth}
                  cy={height - padding - t.y * graphHeight}
                  r={t.confidence > 0.7 ? 4 : 2}
                  fill={color}
                  opacity={t.confidence}
                />
              ))}
            </g>
          )
        )}
      </svg>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
        {selectedKeypoints.map((kpt_name, idx) => (
          <div key={kpt_name} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
            />
            <span className="text-gray-300">{kpt_name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
