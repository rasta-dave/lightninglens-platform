import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import NetworkGraph from './components/NetworkGraph';
import TransactionList from './components/TransactionList';
import TransactionFlow from './components/TransactionFlow';
import PredictionAnalysis from './components/PredictionAnalysis';
import NetworkHealthDashboard from './components/NetworkHealthDashboard';
import TimeSeriesAnalysis from './components/TimeSeriesAnalysis';
import RouteRecommendations from './components/RouteRecommendations';

// Set to false to reduce console logs
const DEBUG = false;

/**
 * NOTE: You might occasionally see this warning in the console:
 * "WebSocket connection failed: WebSocket is closed before the connection is established."
 *
 * This is normal behavior when using React with StrictMode or during development hot reloading.
 * It happens because React may mount/unmount components multiple times during development.
 * The app uses a global WebSocket store that maintains the connection despite these warnings.
 * These warnings do not affect functionality and can be safely ignored.
 */

// Selective logging function
const logDebug = (message, data, always = false) => {
  if (DEBUG || always) {
    if (data) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  }
};

function App() {
  const [transactions, setTransactions] = useState([]);
  const [latestTransaction, setLatestTransaction] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [flowData, setFlowData] = useState([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [simulationInfo, setSimulationInfo] = useState(null);
  const [allSimulations, setAllSimulations] = useState([]);
  const [showSimulationList, setShowSimulationList] = useState(false);
  const [newSimulationNotification, setNewSimulationNotification] =
    useState(null);

  // New state for predictions
  const [predictions, setPredictions] = useState([]);
  const [predictionInfo, setPredictionInfo] = useState(null);
  const [showPredictionsTab, setShowPredictionsTab] = useState(false);

  // Use a stable connection ID that persists across re-renders
  // This connection ID will be used to prevent duplicate connections in StrictMode
  const connectionIdRef = useRef(`connection-${Date.now()}`);

  // Store if this component instance should make WebSocket connections
  // Used to handle StrictMode double mounting - only the most recent mount will connect
  const appInstanceIdRef = useRef(`app-instance-${Date.now()}`);

  // Track if we've already initialized the WebSocket to prevent double connections
  const hasInitializedRef = useRef(false);

  // Use a stable WebSocket URL that doesn't change between renders
  const webSocketUrl = useMemo(() => {
    // Only create the URL once - on the first render
    if (hasInitializedRef.current) {
      return undefined; // Skip URL creation after first render
    }

    logDebug('Creating WebSocket URL (once)');
    return `ws://localhost:3005?t=${Date.now()}`;
  }, []);

  // Define the message handler before using it in useWebSocket
  const handleWebSocketMessage = useCallback((message) => {
    try {
      // Parse message data
      const data = JSON.parse(message.data);

      // Log only important message types or in debug mode
      const isImportant =
        data.type === 'new_simulation_available' ||
        data.type === 'simulation_switched' ||
        data.type === 'predictions_loaded' ||
        data.type === 'error';

      logDebug(`Received message: ${data.type}`, null, isImportant);

      // Process the message based on its type
      switch (data.type) {
        case 'welcome':
          logDebug('Received welcome message:', data.message);
          break;
        case 'transaction':
          handleTransaction(data);
          break;
        case 'simulation_loaded':
          logDebug('Simulation loaded:', data, isImportant);
          setSimulationInfo({
            filename: data.filename,
            transactionCount: data.transactionCount,
            timestamp: data.timestamp,
          });
          break;
        case 'all_simulations':
          logDebug('All simulations:', data);
          setAllSimulations(data.simulations || []);
          break;
        case 'new_simulation_available':
          logDebug('New simulation available:', data, true);
          // Show notification about new simulation
          setNewSimulationNotification({
            filename: data.filename,
            timestamp: data.timestamp,
          });
          break;
        case 'simulation_switched':
          logDebug('Simulation switched:', data, true);
          if (data.success) {
            // Clear notification since we've acknowledged it
            setNewSimulationNotification(null);
            // Clear existing transactions to start fresh with the new simulation
            setTransactions([]);
            setNodes([]);
            setLinks([]);
            setFlowData([]);
            setTotalTransactions(0);
            setCurrentPosition(0);
          }
          break;
        case 'predictions_data':
          logDebug('Received predictions data:', data, isImportant);
          setPredictions(data.predictions || []);
          setPredictionInfo({
            filename: data.filename,
            predictionCount: data.predictions.length,
            timestamp: data.timestamp,
          });
          break;
        case 'predictions_loaded':
          logDebug('Predictions loaded:', data, isImportant);
          // Request the full prediction data
          safeSendMessage({ type: 'get_latest_predictions' });
          break;
        case 'no_predictions':
          logDebug('No predictions available:', data);
          setPredictions([]);
          setPredictionInfo(null);
          break;
        default:
          logDebug('Unhandled message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }, []);

  // Define the onOpen handler
  const handleWebSocketOpen = useCallback((event, socketSendFn) => {
    // Only log the first connection or in debug mode
    const isFirstConnection = !hasInitializedRef.current;
    logDebug(
      `WebSocket connection established (ID: ${connectionIdRef.current}, Instance: ${appInstanceIdRef.current})`,
      null,
      isFirstConnection
    );

    // Mark the connection as initialized
    hasInitializedRef.current = true;

    // Use the direct send function provided in the callback to avoid race conditions
    // This guarantees the socket is ready since we're in the onOpen callback
    try {
      logDebug(
        'Requesting simulation info and list (using direct send)...',
        null,
        isFirstConnection
      );
      const infoMsg = JSON.stringify({ type: 'get_simulation_info' });
      const listMsg = JSON.stringify({ type: 'get_all_simulations' });
      const predictionsMsg = JSON.stringify({ type: 'get_latest_predictions' });

      socketSendFn(infoMsg);
      socketSendFn(listMsg);
      socketSendFn(predictionsMsg);
    } catch (err) {
      console.error('Error sending initial messages:', err);
    }
  }, []);

  // Track the most recent app instance (for StrictMode handling)
  const [mostRecentInstance, setMostRecentInstance] = useState(null);

  // On mount, set this instance as the most recent - only once per instance
  useEffect(() => {
    const currentInstance = appInstanceIdRef.current;
    logDebug(`App component mounted (Instance: ${currentInstance})`);

    // Only update if it's different to avoid potential re-render loops
    if (mostRecentInstance !== currentInstance) {
      setMostRecentInstance(currentInstance);
    }

    // On unmount, clear the instance if it's this one
    return () => {
      logDebug(`App component unmounting (Instance: ${currentInstance})`);
    };
  }, []); // Empty dependency array to run only on mount/unmount

  // Determine if this instance should initialize the WebSocket
  const shouldConnect = mostRecentInstance === appInstanceIdRef.current;

  // Call useWebSocket (we only need one stable connection)
  const { connectionStatus, lastMessage, reconnect, sendMessage } =
    useWebSocket({
      url: webSocketUrl,
      connectionId: connectionIdRef.current,
      skipConnection: !shouldConnect || !webSocketUrl, // Skip if not the most recent instance or no URL
      onOpen: handleWebSocketOpen,
      onMessage: handleWebSocketMessage,
      onClose: (event) => {
        logDebug(
          `WebSocket connection closed (ID: ${connectionIdRef.current}, code: ${event.code})`,
          null,
          true // Always log connection closures
        );
      },
      onError: (error) => {
        console.error(
          `WebSocket error (ID: ${connectionIdRef.current}):`,
          error
        );
      },
      debug: DEBUG, // Pass debug flag to useWebSocket
    });

  // Helper function to safely serialize and send messages
  const safeSendMessage = useCallback(
    (data) => {
      try {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        return sendMessage(payload);
      } catch (error) {
        console.error('Error preparing message for sending:', error);
        return false;
      }
    },
    [sendMessage]
  );

  // When a new simulation notification is received, update the simulation list
  useEffect(() => {
    if (newSimulationNotification) {
      // Auto-update the list of simulations
      setTimeout(() => {
        safeSendMessage({ type: 'get_all_simulations' });
      }, 50);
    }
  }, [newSimulationNotification, safeSendMessage]);

  // Check for new predictions periodically
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (connectionStatus === 'connected') {
        safeSendMessage({ type: 'check_for_new_predictions' });
      }
    }, 60000); // Check every minute

    return () => clearInterval(checkInterval);
  }, [connectionStatus, safeSendMessage]);

  // Function to handle incoming transaction data
  const handleTransaction = (data) => {
    const transaction = data.data;
    setLatestTransaction(transaction);
    setTotalTransactions(data.total);
    setCurrentPosition(data.current);

    // Keep the most recent 50 transactions
    setTransactions((prev) => {
      const updatedTransactions = [...prev, transaction].slice(-50);
      return updatedTransactions;
    });

    // Update network graph
    updateNetworkGraph(transaction);

    // Update flow data
    updateFlowData(transaction);
  };

  // Function to update network graph data
  const updateNetworkGraph = (transaction) => {
    setNodes((prevNodes) => {
      // Add sender node if it doesn't exist
      const senderExists = prevNodes.some(
        (node) => node.id === transaction.sender
      );
      const receiverExists = prevNodes.some(
        (node) => node.id === transaction.receiver
      );

      const updatedNodes = [...prevNodes];

      if (!senderExists) {
        updatedNodes.push({
          id: transaction.sender,
          name: `Node ${transaction.sender}`,
          transactions: 1,
        });
      } else {
        // Update transaction count for existing node
        const senderIndex = updatedNodes.findIndex(
          (node) => node.id === transaction.sender
        );
        if (senderIndex !== -1) {
          updatedNodes[senderIndex] = {
            ...updatedNodes[senderIndex],
            transactions: (updatedNodes[senderIndex].transactions || 0) + 1,
          };
        }
      }

      if (!receiverExists) {
        updatedNodes.push({
          id: transaction.receiver,
          name: `Node ${transaction.receiver}`,
          transactions: 1,
        });
      } else {
        // Update transaction count for existing node
        const receiverIndex = updatedNodes.findIndex(
          (node) => node.id === transaction.receiver
        );
        if (receiverIndex !== -1) {
          updatedNodes[receiverIndex] = {
            ...updatedNodes[receiverIndex],
            transactions: (updatedNodes[receiverIndex].transactions || 0) + 1,
          };
        }
      }

      return updatedNodes;
    });

    setLinks((prevLinks) => {
      // Check if the link already exists
      const existingLinkIndex = prevLinks.findIndex(
        (link) =>
          link.source === transaction.sender &&
          link.target === transaction.receiver
      );

      const updatedLinks = [...prevLinks];

      if (existingLinkIndex === -1) {
        // Add new link
        updatedLinks.push({
          source: transaction.sender,
          target: transaction.receiver,
          value: parseFloat(transaction.amount) || 1,
          count: 1,
        });
      } else {
        // Update existing link
        updatedLinks[existingLinkIndex] = {
          ...updatedLinks[existingLinkIndex],
          value:
            (updatedLinks[existingLinkIndex].value || 0) +
            (parseFloat(transaction.amount) || 1),
          count: (updatedLinks[existingLinkIndex].count || 0) + 1,
        };
      }

      return updatedLinks;
    });
  };

  // Function to update flow data
  const updateFlowData = (transaction) => {
    setFlowData((prevFlowData) => {
      const key = `${transaction.sender}-${transaction.receiver}`;
      const existingIndex = prevFlowData.findIndex((item) => item.key === key);

      if (existingIndex === -1) {
        return [
          ...prevFlowData,
          {
            key,
            source: transaction.sender,
            target: transaction.receiver,
            amount: parseFloat(transaction.amount) || 0,
            count: 1,
          },
        ].slice(-20); // Keep only the most recent 20 flow entries
      } else {
        const updatedFlowData = [...prevFlowData];
        updatedFlowData[existingIndex] = {
          ...updatedFlowData[existingIndex],
          amount:
            (updatedFlowData[existingIndex].amount || 0) +
            (parseFloat(transaction.amount) || 0),
          count: (updatedFlowData[existingIndex].count || 0) + 1,
        };
        return updatedFlowData;
      }
    });
  };

  // Function to request a switch to a different simulation
  const handleSwitchSimulation = (filename) => {
    setShowSimulationList(false);
    safeSendMessage({
      type: 'switch_simulation',
      filename: filename,
    });
  };

  // Function to reset the current simulation
  const handleResetSimulation = () => {
    safeSendMessage({
      type: 'reset_simulation',
    });
    setTransactions([]);
    setNodes([]);
    setLinks([]);
    setFlowData([]);
    setCurrentPosition(0);
  };

  // Function to toggle simulation list visibility
  const toggleSimulationList = () => {
    setShowSimulationList(!showSimulationList);
    if (!showSimulationList) {
      // Update the simulation list when opening it
      safeSendMessage({ type: 'get_all_simulations' });
    }
  };

  // Function to dismiss a new simulation notification
  const dismissNotification = () => {
    setNewSimulationNotification(null);
  };

  return (
    <div className='min-h-screen bg-gray-900 text-gray-100'>
      {/* Header */}
      <header className='bg-gradient-to-r from-blue-900 to-purple-900 text-white p-4 shadow-lg border-b border-blue-700'>
        <div className='container mx-auto flex justify-between items-center'>
          <div className='flex items-center'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-8 w-8 mr-2 text-yellow-400'
              viewBox='0 0 20 20'
              fill='currentColor'>
              <path
                fillRule='evenodd'
                d='M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z'
                clipRule='evenodd'
              />
            </svg>
            <h1 className='text-2xl font-bold'>LightningLens Dashboard</h1>
          </div>
          <div className='flex items-center'>
            {connectionStatus === 'connected' ? (
              <span className='text-green-300 flex items-center bg-green-900/30 px-3 py-1 rounded-full'>
                <span className='inline-block h-3 w-3 rounded-full bg-green-400 mr-2 animate-pulse'></span>
                Connected
              </span>
            ) : (
              <span className='text-red-300 flex items-center bg-red-900/30 px-3 py-1 rounded-full'>
                <span className='inline-block h-3 w-3 rounded-full bg-red-400 mr-2'></span>
                {connectionStatus === 'connecting'
                  ? 'Connecting...'
                  : connectionStatus === 'disconnected'
                  ? 'Disconnected'
                  : 'Error'}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* New Simulation Notification */}
      {newSimulationNotification && (
        <div className='bg-channel-panel border-l-4 border-channel-yellow p-4 mb-4 mx-4 mt-4 rounded shadow-lightning-glow'>
          <div className='flex justify-between items-center'>
            <div>
              <p className='font-bold text-satoshi-white'>
                New Simulation Data Available
              </p>
              <p className='text-lightning-blue'>
                {newSimulationNotification.filename}{' '}
                <span className='text-channel-yellow'>
                  (
                  {new Date(
                    newSimulationNotification.timestamp
                  ).toLocaleTimeString()}
                  )
                </span>
              </p>
            </div>
            <div className='flex space-x-2'>
              <button
                onClick={() =>
                  handleSwitchSimulation(newSimulationNotification.filename)
                }
                className='lightning-btn'>
                View Now
              </button>
              <button
                onClick={dismissNotification}
                className='px-3 py-1 bg-dark-node hover:bg-opacity-90 text-satoshi-white rounded transition-all duration-200 focus:ring-2 focus:ring-lightning-purple focus:ring-opacity-50 focus:outline-none'>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simulation Info & Controls */}
      <div className='container mx-auto p-4 mb-4 bg-node-background shadow-lightning-glow rounded-lg mt-4 border border-lightning-blue border-opacity-20'>
        <div className='flex justify-between items-center flex-wrap'>
          <div>
            <h2 className='text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-bitcoin-orange to-lightning-blue'>
              {simulationInfo
                ? simulationInfo.filename
                : 'No simulation data loaded'}
            </h2>
            <p className='text-satoshi-white'>
              {totalTransactions > 0
                ? `Transactions: ${currentPosition} / ${totalTransactions}`
                : 'No transaction data yet'}
              {totalTransactions > 0 &&
                currentPosition >= totalTransactions && (
                  <span className='ml-2 text-node-green font-semibold'>
                    (Simulation Complete)
                  </span>
                )}
            </p>
          </div>
          <div className='flex space-x-2 mt-2 sm:mt-0'>
            <button onClick={handleResetSimulation} className='bitcoin-btn'>
              <span className='flex items-center'>
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  className='h-4 w-4 mr-1'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                  />
                </svg>
                Restart
              </span>
            </button>
            <button onClick={toggleSimulationList} className='lightning-btn'>
              <span className='flex items-center'>
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  className='h-4 w-4 mr-1'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M4 6h16M4 12h16M4 18h7'
                  />
                </svg>
                {showSimulationList
                  ? 'Hide Simulation Data'
                  : 'Show Simulation Data'}
              </span>
            </button>
            <button
              onClick={() => setShowPredictionsTab(!showPredictionsTab)}
              className={`px-4 py-2 ${
                showPredictionsTab
                  ? 'bg-lightning-purple'
                  : 'bg-gradient-to-r from-lightning-start to-lightning-end'
              } hover:bg-opacity-90 text-satoshi-white rounded transition-all duration-200 shadow-lightning-glow focus:outline-none`}>
              <span className='flex items-center'>
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  className='h-4 w-4 mr-1'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
                  />
                </svg>
                {showPredictionsTab ? 'Hide ML Analytics' : 'Show ML Analytics'}
              </span>
            </button>
          </div>
        </div>

        {/* Simulation List Dropdown */}
        {showSimulationList && (
          <div className='mt-4 border border-lightning-blue border-opacity-20 rounded-lg p-2 max-h-60 overflow-y-auto bg-dark-node'>
            <h3 className='font-semibold text-lg mb-2 text-lightning-blue'>
              Available Simulation Data
            </h3>
            {allSimulations.length === 0 ? (
              <p className='text-gray-400'>No simulation data found</p>
            ) : (
              <ul className='divide-y divide-lightning-blue/10'>
                {allSimulations.map((sim) => (
                  <li
                    key={sim.filename}
                    className={`p-2 cursor-pointer hover:bg-node-background transition-colors duration-150 ${
                      simulationInfo && simulationInfo.filename === sim.filename
                        ? 'bg-lightning-blue/10'
                        : ''
                    }`}
                    onClick={() => handleSwitchSimulation(sim.filename)}>
                    <div className='flex justify-between items-center'>
                      <div>
                        <span
                          className={`font-medium ${
                            simulationInfo &&
                            simulationInfo.filename === sim.filename
                              ? 'text-lightning-blue'
                              : 'text-satoshi-white'
                          }`}>
                          {sim.filename}
                        </span>
                        <p className='text-sm text-gray-400'>
                          Modified: {new Date(sim.modified).toLocaleString()}
                        </p>
                      </div>
                      {simulationInfo &&
                        simulationInfo.filename === sim.filename && (
                          <span className='text-xs px-2 py-1 bg-gradient-to-r from-bitcoin-orange to-lightning-blue text-satoshi-white rounded-full'>
                            Current
                          </span>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Network Health Dashboard */}
      {nodes.length > 0 && (
        <div className='container mx-auto mb-6'>
          <div className='dashboard-card'>
            <NetworkHealthDashboard
              nodes={nodes}
              links={links}
              transactions={transactions}
              predictions={predictions}
            />
          </div>
        </div>
      )}

      {/* Time Series Analysis - New Section */}
      {nodes.length > 0 && (
        <div className='container mx-auto mb-6'>
          <div className='dashboard-card'>
            <TimeSeriesAnalysis
              transactions={transactions}
              nodes={nodes}
              links={links}
            />
          </div>
        </div>
      )}

      {/* Route Recommendations - New Section */}
      {nodes.length > 0 && predictions.length > 0 && (
        <div className='container mx-auto mb-6'>
          <div className='dashboard-card'>
            <RouteRecommendations
              nodes={nodes}
              links={links}
              predictions={predictions}
            />
          </div>
        </div>
      )}

      {/* ML Predictions Section */}
      {showPredictionsTab && (
        <div className='container mx-auto mb-6'>
          <div className='dashboard-card'>
            <div className='flex items-center mb-4'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                className='h-6 w-6 mr-2 text-lightning-purple'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
                />
              </svg>
              <h2 className='dashboard-header'>
                Channel Balance Predictions
                {predictionInfo && (
                  <span className='text-sm font-normal ml-2 text-lightning-purple'>
                    from {predictionInfo.filename}
                  </span>
                )}
              </h2>
            </div>
            <PredictionAnalysis predictions={predictions} />
          </div>
        </div>
      )}

      {/* Dashboard Content */}
      <div className='container mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 p-4'>
        {/* Transaction List */}
        <div className='dashboard-card'>
          <div className='flex items-center mb-4'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-6 w-6 mr-2 text-bitcoin-orange'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M13 10V3L4 14h7v7l9-11h-7z'
              />
            </svg>
            <h2 className='dashboard-header'>Recent Transactions</h2>
          </div>
          <TransactionList transactions={transactions} />
        </div>

        {/* Network Visualization */}
        <div className='dashboard-card'>
          <div className='flex items-center mb-4'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-6 w-6 mr-2 text-lightning-blue'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z'
              />
            </svg>
            <h2 className='dashboard-header'>Lightning Network</h2>
          </div>
          <NetworkGraph nodes={nodes} links={links} />
        </div>

        {/* Transaction Flow */}
        <div className='dashboard-card col-span-1 md:col-span-2'>
          <div className='flex items-center mb-4'>
            <svg
              xmlns='http://www.w3.org/2000/svg'
              className='h-6 w-6 mr-2 text-channel-yellow'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
              />
            </svg>
            <h2 className='dashboard-header'>Transaction Flow</h2>
          </div>
          <TransactionFlow flowData={flowData} />
        </div>
      </div>

      {/* Connection Status Indicator */}
      {(connectionStatus === 'error' ||
        connectionStatus === 'disconnected') && (
        <div className='fixed bottom-4 right-4 bg-red-900/40 border-l-4 border-red-500 text-red-200 p-4 rounded shadow-lg'>
          <p className='font-bold'>Connection Lost</p>
          <p>Attempting to reconnect automatically...</p>
          <button
            onClick={reconnect}
            className='mt-2 bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-4 rounded transition-colors duration-200'>
            Reconnect Now
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
