import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  // Disabling StrictMode to prevent double mounting in development
  // React.StrictMode is helpful for development but is causing WebSocket issues
  // <React.StrictMode>
  <App />
  // </React.StrictMode>
);
