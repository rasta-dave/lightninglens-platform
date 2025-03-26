import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
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

  // Get WebSocket context
  const { sendMessage, registerMessageHandler } = useWebSocketContext();

  // Create memoized functions to update the network graph
  const updateNetworkGraph = useCallback((transaction) => {
    if (!transaction || !transaction.sender || !transaction.receiver) {
      console.error('Received invalid transaction data:', transaction);
      return;
    }

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
  }, []);

  const updateFlowData = useCallback((transaction) => {
    if (!transaction || !transaction.sender || !transaction.receiver) {
      return;
    }

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
  }, []);

  // Function to handle transaction data
  const handleTransaction = useCallback(
    (data) => {
      const transaction = data.data;

      // Basic validation of transaction data
      if (!transaction || !transaction.sender || !transaction.receiver) {
        console.error('Received invalid transaction:', transaction);
        return;
      }

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
    },
    [updateNetworkGraph, updateFlowData]
  );

  // Switch to a different simulation
  const switchSimulation = useCallback(
    (filename) => {
      // Signal that we're starting a load
      setIsLoading(true);

      // Clean up existing data to prevent rendering glitches
      setTransactions([]);
      setNodes([]);
      setLinks([]);
      setFlowData([]);
      setTotalTransactions(0);
      setCurrentPosition(0);

      // Track that user has manually selected this file
      setUserSelectedFile(filename);

      console.log('Switching to simulation:', filename);

      // Use a timeout to ensure we don't send the message before the UI has updated
      setTimeout(() => {
        sendMessage({
          type: 'switch_simulation',
          filename: filename,
          isUserSelected: true,
        });
      }, 50);
    },
    [sendMessage]
  );

  // Reset the current simulation
  const resetSimulation = useCallback(() => {
    // Start loading indicator
    setIsLoading(true);

    // Clean up existing data to prevent rendering artifacts
    setTransactions([]);
    setNodes([]);
    setLinks([]);
    setFlowData([]);
    setCurrentPosition(0);

    setTimeout(() => {
      sendMessage({
        type: 'reset_simulation',
      });
    }, 50);
  }, [sendMessage]);

  // View the latest simulation
  const viewLatestSimulation = useCallback(() => {
    // Clear user selection to allow auto-switching again
    setUserSelectedFile(null);

    // Start loading indicator
    setIsLoading(true);

    // Clean up existing data to prevent rendering artifacts
    setTransactions([]);
    setNodes([]);
    setLinks([]);
    setFlowData([]);
    setTotalTransactions(0);
    setCurrentPosition(0);

    // Find and load the most recent simulation
    if (allSimulations.length > 0) {
      const latestSim = allSimulations[0]; // Simulations are sorted with most recent first
      setTimeout(() => {
        sendMessage({
          type: 'switch_simulation',
          filename: latestSim.filename,
          isUserSelected: false,
        });
      }, 50);
    }
  }, [allSimulations, sendMessage]);

  // Dismiss notification
  const dismissNotification = useCallback(() => {
    setNewSimulationNotification(null);
  }, []);

  // Register WebSocket message handlers
  useEffect(() => {
    const unregisterHandlers = [
      registerMessageHandler('welcome', (data) => {
        console.log('Received welcome message:', data.message);
        // If we have a user-selected file, request it on connection
        if (userSelectedFile) {
          setTimeout(() => {
            sendMessage({
              type: 'switch_simulation',
              filename: userSelectedFile,
              isUserSelected: true,
            });
          }, 500);
        } else {
          // Request simulation info and list
          sendMessage({ type: 'get_simulation_info' });
          sendMessage({ type: 'get_all_simulations' });
        }
      }),

      registerMessageHandler('transaction', handleTransaction),

      registerMessageHandler('simulation_loaded', (data) => {
        console.log('Simulation loaded:', data);
        // Delay state update slightly to ensure loading indicator shows
        setTimeout(() => {
          setIsLoading(false); // Stop loading when simulation is loaded

          // Update simulation info without manual selection checks
          setSimulationInfo({
            filename: data.filename,
            transactionCount: data.transactionCount,
            timestamp: data.timestamp,
          });
        }, 300);
      }),

      registerMessageHandler('all_simulations', (data) => {
        console.log('All simulations:', data);
        setAllSimulations(data.simulations || []);
      }),

      registerMessageHandler('new_simulation_available', (data) => {
        console.log('New simulation available:', data);
        // Show notification for all new simulations
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
        console.log('Received predictions data:', data);
        setPredictions(data.predictions || []);
        setPredictionInfo({
          filename: data.filename,
          predictionCount: data.predictions.length,
          timestamp: data.timestamp,
        });
      }),

      registerMessageHandler('predictions_loaded', (data) => {
        console.log('Predictions loaded:', data);
        // Request the full prediction data
        sendMessage({ type: 'get_latest_predictions' });
      }),

      registerMessageHandler('no_predictions', (data) => {
        console.log('No predictions available:', data);
        setPredictions([]);
        setPredictionInfo(null);
      }),
    ];

    // Cleanup function to unregister all handlers
    return () => {
      unregisterHandlers.forEach((unregister) => unregister());
    };
  }, [
    registerMessageHandler,
    handleTransaction,
    sendMessage,
    userSelectedFile,
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

  // Check for new predictions periodically
  useEffect(() => {
    const checkInterval = setInterval(() => {
      sendMessage({ type: 'check_for_new_predictions' });
    }, 60000); // Check every minute

    return () => clearInterval(checkInterval);
  }, [sendMessage]);

  // Context value
  const contextValue = {
    // Simulation data
    transactions,
    latestTransaction,
    nodes,
    links,
    flowData,
    totalTransactions,
    currentPosition,
    simulationInfo,
    allSimulations,
    isLoading,
    userSelectedFile,
    newSimulationNotification,
    predictions,
    predictionInfo,

    // Actions
    switchSimulation,
    resetSimulation,
    viewLatestSimulation,
    dismissNotification,
  };

  return (
    <SimulationContext.Provider value={contextValue}>
      {children}
    </SimulationContext.Provider>
  );
};

// Custom hook for using the simulation context
export const useSimulation = () => {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error('useSimulation must be used within a SimulationProvider');
  }
  return context;
};
