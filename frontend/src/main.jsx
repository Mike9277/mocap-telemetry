/*
######################
#  main.jsx
#
# React Application Entry Point
# Initializes the React root and renders the main App component
#
# Author: Michelangelo Guaitolini, 11.03.2026
######################
*/

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
