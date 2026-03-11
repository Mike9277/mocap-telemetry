/*
######################
#  JointChart.jsx
#
# Component for displaying motion capture joint data as time series charts
# Shows X, Y, Z coordinates over time with smooth line visualization
#
# Author: Michelangelo Guaitolini, 11.03.2026
######################
*/

/*
######################
#  JointChart.jsx
#
# Component for displaying motion capture joint data as time series charts
# Shows X, Y, Z coordinates over time with smooth line visualization
#
# Author: Michelangelo Guaitolini, 11.03.2026
######################
*/

import React, { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'

export function JointChart({ data, joint, title }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 h-80 flex items-center justify-center">
        <span className="text-gray-500">No data available</span>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
          <XAxis 
            dataKey="timestamp" 
            tick={{ fontSize: 12 }}
            tickFormatter={(val) => {
              const date = new Date(val)
              return date.toLocaleTimeString()
            }}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #4b5563' }}
            labelStyle={{ color: '#9ca3af' }}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="x" 
            stroke="#3b82f6" 
            dot={false}
            isAnimationActive={false}
            name="X"
          />
          <Line 
            type="monotone" 
            dataKey="y" 
            stroke="#10b981" 
            dot={false}
            isAnimationActive={false}
            name="Y"
          />
          <Line 
            type="monotone" 
            dataKey="z" 
            stroke="#f59e0b" 
            dot={false}
            isAnimationActive={false}
            name="Z"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
