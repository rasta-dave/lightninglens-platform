import React, { useState, useEffect } from 'react';
import {
  WebSocketProvider,
  useWebSocketContext,
} from './contexts/WebSocketContext';
import { SimulationProvider } from './contexts/SimulationContext';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Header from './components/layout/Header';
import SimulationControls from './components/layout/SimulationControls';
import NewSimulationNotification from './components/layout/NewSimulationNotification';
import LoadingOverlay from './components/layout/LoadingOverlay';
import ConnectionStatus from './components/layout/ConnectionStatus';
import DashboardContainer from './components/layout/DashboardContainer';
import Test from './components/Test';

// Main App Component
function App() {
  const [showPredictionsTab, setShowPredictionsTab] = useState(false);

  return (
    <Router>
      <div className='min-h-screen bg-gray-900 text-gray-100'>
        <Routes>
          <Route path='/test' element={<Test />} />
          <Route
            path='/'
            element={
              <>
                <Header />
                <NewSimulationNotification />
                <LoadingOverlay />
                <SimulationControls
                  showPredictionsTab={showPredictionsTab}
                  setShowPredictionsTab={setShowPredictionsTab}
                />
                <DashboardContainer showPredictionsTab={showPredictionsTab} />
                <ConnectionStatus />
              </>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

// Component that initializes the WebSocket connection
const WebSocketInitializer = () => {
  const { initializeWebSocket } = useWebSocketContext();

  useEffect(() => {
    // Initialize WebSocket connection with the server
    initializeWebSocket(`ws://localhost:3005?t=${Date.now()}`);
  }, [initializeWebSocket]);

  return null;
};

// Root component that wraps everything with providers
const Root = () => {
  return (
    <WebSocketProvider>
      <SimulationProvider>
        <WebSocketInitializer />
        <App />
      </SimulationProvider>
    </WebSocketProvider>
  );
};

export default Root;
