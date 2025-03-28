import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useWebSocketContext } from './WebSocketContext';

// Create context
const SimulationContext = createContext(null);

export const SimulationProvider = ({ children }) => {
  // Simulation state
  const [transactions, setTransactions] = useState([]);
  const [latestTransaction, setLatestTransaction] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [flowData, setFlowData] = useState([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [simulationInfo, setSimulationInfo] = useState(null);
  const [allSimulations, setAllSimulations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userSelectedFile, setUserSelectedFile] = useState(null);
  const [newSimulationNotification, setNewSimulationNotification] =
    useState(null);
  const [predictions, setPredictions] = useState([]);
  const [predictionInfo, setPredictionInfo] = useState(null);
  const [isPredictionsLoading, setIsPredictionsLoading] = useState(false);

  // Ref to track prediction data requests and avoid redundant requests
  const predictionRequestTimeoutRef = useRef(null);
  const lastPredictionRequestTimeRef = useRef(0);
  const isPredictionsRequested = useRef(false);

  // Get WebSocket context
  const { sendMessage, registerMessageHandler } = useWebSocketContext();

  // Request simulation data
  const requestSimulationData = useCallback(() => {
    sendMessage({ type: 'get_simulation_info' });
    sendMessage({ type: 'get_all_simulations' });
  }, [sendMessage]);

  // Switch to a specific simulation
  const switchToSimulation = useCallback(
    (filename, isUserSelected = false) => {
      console.log(`Switching to simulation: ${filename}`);
      setIsLoading(true);
      sendMessage({
        type: 'switch_simulation',
        filename,
        isUserSelected,
      });

      if (isUserSelected) {
        setUserSelectedFile(filename);
      }
    },
    [sendMessage]
  );

  // Reset current simulation
  const resetSimulation = useCallback(() => {
    console.log('Resetting simulation');
    setIsLoading(true);
    sendMessage({ type: 'reset_simulation' });
  }, [sendMessage]);

  // Request prediction data with debouncing and caching
  const requestPredictionData = useCallback(() => {
    // Only allow one request every 5 seconds
    const now = Date.now();
    const timeSinceLastRequest = now - lastPredictionRequestTimeRef.current;

    if (isPredictionsRequested.current) {
      console.log('Prediction data already requested, waiting for response...');
      return;
    }

    if (timeSinceLastRequest < 5000) {
      console.log(
        `Throttling prediction request, last request was ${timeSinceLastRequest}ms ago`
      );

      // Clear any existing timeout
      if (predictionRequestTimeoutRef.current) {
        clearTimeout(predictionRequestTimeoutRef.current);
      }

      // Set a timeout to make the request when ready
      predictionRequestTimeoutRef.current = setTimeout(() => {
        requestPredictionData();
      }, 5000 - timeSinceLastRequest);

      return;
    }

    console.log('Requesting prediction data...');
    setIsPredictionsLoading(true);
    isPredictionsRequested.current = true;
    lastPredictionRequestTimeRef.current = now;

    // Send message to fetch latest predictions
    sendMessage({ type: 'get_latest_predictions' });
  }, [sendMessage]);

  // Handle transaction data
  const handleTransaction = useCallback((data) => {
    if (!data || !data.payload) return;

    const transaction = {
      ...data.payload,
      timestamp: data.timestamp || new Date().toISOString(),
    };

    console.log('Setting latest transaction:', transaction);
    setLatestTransaction(transaction);
    setTransactions((prevTransactions) => {
      // Keep a reasonable transaction history
      const newTransactions = [...prevTransactions, transaction];
      if (newTransactions.length > 50) {
        return newTransactions.slice(
          newTransactions.length - 50,
          newTransactions.length
        );
      }
      return newTransactions;
    });
  }, []);

  // Clear notifications
  const clearNotification = useCallback(() => {
    setNewSimulationNotification(null);
  }, []);

  // Check available simulations
  useEffect(() => {
    requestSimulationData();
  }, [requestSimulationData]);

  // Register WebSocket message handlers
  useEffect(() => {
    const unregisterHandlers = [
      registerMessageHandler('welcome', (data) => {
        console.log('Connected to Lightning Lens data stream:', data);
        requestSimulationData();
      }),

      registerMessageHandler('simulation_loaded', (data) => {
        console.log('Simulation loaded:', data);
        setSimulationInfo({
          filename: data.filename,
          transactionCount: data.transactionCount,
          timestamp: data.timestamp,
        });
      }),

      registerMessageHandler('all_simulations', (data) => {
        console.log('Available simulations:', data.simulations);
        setAllSimulations(data.simulations);
      }),

      registerMessageHandler('transactions', (data) => {
        console.log('Received transactions batch');

        // Update transactions received so far
        setTotalTransactions(data.totalTransactions || 0);
        setCurrentPosition(data.currentPosition || 0);

        // Update nodes and links once per batch
        if (data.nodes && data.nodes.length > 0) {
          console.log(`Updating ${data.nodes.length} nodes`);
          setNodes(data.nodes);
        }

        if (data.links && data.links.length > 0) {
          console.log(`Updating ${data.links.length} links`);
          setLinks(data.links);
        }

        if (data.flowData && data.flowData.length > 0) {
          console.log(`Updating flow data with ${data.flowData.length} items`);
          setFlowData(data.flowData);
        }

        if (data.transactions && data.transactions.length > 0) {
          console.log(`Processing ${data.transactions.length} transactions`);
          setTransactions(data.transactions.slice(-50)); // Keep the 50 most recent
        }

        // Delay stopping the loading indicator to ensure we see it
        setTimeout(() => {
          setIsLoading(false);
        }, 500);
      }),

      registerMessageHandler('transaction', (data) => {
        console.log('Received individual transaction');
        handleTransaction(data);
      }),

      registerMessageHandler('new_simulation_available', (data) => {
        console.log('New simulation available:', data);
        setNewSimulationNotification({
          filename: data.filename,
          timestamp: data.timestamp,
        });
      }),

      registerMessageHandler('simulation_switched', (data) => {
        console.log('Simulation switched:', data);
        if (data.success) {
          // Clear notification since we've acknowledged it
          setNewSimulationNotification(null);

          // Delay stopping the loading indicator to ensure we see it
          setTimeout(() => {
            setIsLoading(false);
          }, 300);
        }
      }),

      registerMessageHandler('predictions_data', (data) => {
        console.log(
          `Received predictions data: ${
            data.predictions?.length || 0
          } predictions`
        );

        // Mark request as completed
        isPredictionsRequested.current = false;
        setIsPredictionsLoading(false);

        // Update state with prediction data
        if (data.predictions && Array.isArray(data.predictions)) {
          // Process and format prediction data for consistency
          const formattedPredictions = data.predictions.map((pred) => ({
            ...pred,
            // Ensure all numeric fields are strings with consistent format
            capacity: pred.capacity?.toString() || '0',
            balance_ratio:
              pred.balance_ratio?.toString() ||
              pred.current_ratio?.toString() ||
              '0.5',
            optimal_ratio:
              pred.optimal_ratio?.toString() ||
              pred.predicted_ratio?.toString() ||
              '0.5',
            adjustment_needed: pred.adjustment_needed?.toString() || '0',
            success_rate: pred.success_rate?.toString() || '0.85',
          }));

          setPredictions(formattedPredictions);
        } else {
          setPredictions([]);
        }

        setPredictionInfo({
          filename: data.filename,
          predictionCount: data.predictions?.length || 0,
          timestamp: data.timestamp,
        });
      }),

      registerMessageHandler('predictions_loaded', (data) => {
        console.log('Predictions loaded notification received:', data);
        // Request the full prediction data, but only if we haven't recently requested it
        if (!isPredictionsRequested.current) {
          requestPredictionData();
        }
      }),

      registerMessageHandler('no_predictions', (data) => {
        console.log('No predictions available:', data);
        setPredictions([]);
        setPredictionInfo(null);
        setIsPredictionsLoading(false);
        isPredictionsRequested.current = false;
      }),
    ];

    // Cleanup function to unregister all handlers
    return () => {
      unregisterHandlers.forEach((unregister) => unregister());

      // Clear any pending timeouts
      if (predictionRequestTimeoutRef.current) {
        clearTimeout(predictionRequestTimeoutRef.current);
      }
    };
  }, [
    registerMessageHandler,
    handleTransaction,
    sendMessage,
    userSelectedFile,
    requestPredictionData,
  ]);

  // When a new simulation notification is received, update the simulation list
  useEffect(() => {
    if (newSimulationNotification) {
      // Auto-update the list of simulations
      setTimeout(() => {
        sendMessage({ type: 'get_all_simulations' });
      }, 50);
    }
  }, [newSimulationNotification, sendMessage]);

  // Check for new predictions periodically, but with proper throttling
  useEffect(() => {
    const checkInterval = setInterval(() => {
      // Only check if we're not already loading
      if (!isPredictionsLoading && !isPredictionsRequested.current) {
        sendMessage({ type: 'check_for_new_predictions' });
      }
    }, 60000); // Check every minute

    return () => clearInterval(checkInterval);
  }, [sendMessage, isPredictionsLoading]);

  return (
    <SimulationContext.Provider
      value={{
        nodes,
        links,
        transactions,
        latestTransaction,
        flowData,
        totalTransactions,
        currentPosition,
        simulationInfo,
        allSimulations,
        isLoading,
        newSimulationNotification,
        userSelectedFile,
        predictions,
        predictionInfo,
        isPredictionsLoading,
        switchToSimulation,
        requestSimulationData,
        clearNotification,
        resetSimulation,
        requestPredictionData,
      }}>
      {children}
    </SimulationContext.Provider>
  );
};

export const useSimulation = () => {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error('useSimulation must be used within SimulationProvider');
  }
  return context;
};
