import React, { useState, useMemo } from 'react';

const RouteRecommendations = ({ nodes = [], links = [], predictions = [] }) => {
  const [selectedNode, setSelectedNode] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  // Generate route recommendations based on network data and predictions
  const recommendations = useMemo(() => {
    if (!nodes.length || !links.length || !predictions.length) return [];

    // Create a map of node IDs to their connections from the links data
    const nodeConnections = new Map();
    links.forEach((link) => {
      const source =
        typeof link.source === 'object' ? link.source.id : link.source;
      const target =
        typeof link.target === 'object' ? link.target.id : link.target;

      // Add source -> target connection
      if (!nodeConnections.has(source)) {
        nodeConnections.set(source, new Set());
      }
      nodeConnections.get(source).add(target);

      // Add target -> source connection (bidirectional)
      if (!nodeConnections.has(target)) {
        nodeConnections.set(target, new Set());
      }
      nodeConnections.get(target).add(source);
    });

    // Extract node identifiers from the prediction channel IDs
    // For format like "lnd-alice_02c340b3", we'll use "alice" as the node ID
    const channelBalances = new Map();
    const nodeIdMap = new Map(); // Map to track node names to IDs

    // First, identify all unique node names from predictions
    predictions.forEach((prediction) => {
      if (!prediction.channel_id) return;

      // Extract node name from channel_id (format: lnd-nodeName_hash)
      const channelMatch = prediction.channel_id.match(/lnd-(\w+)_/);
      if (!channelMatch || !channelMatch[1]) return;

      const nodeName = channelMatch[1].toLowerCase();

      // Map node names to node IDs from our nodes array if possible
      nodes.forEach((node) => {
        const nodeIdLower = node.id.toLowerCase();
        if (nodeIdLower.includes(nodeName) || nodeName.includes(nodeIdLower)) {
          nodeIdMap.set(nodeName, node.id);
        }
      });
    });

    // If we couldn't match node names to node IDs, create artificial ones
    if (nodeIdMap.size === 0) {
      const uniqueNodeNames = new Set();
      predictions.forEach((prediction) => {
        if (!prediction.channel_id) return;
        const channelMatch = prediction.channel_id.match(/lnd-(\w+)_/);
        if (!channelMatch || !channelMatch[1]) return;
        uniqueNodeNames.add(channelMatch[1].toLowerCase());
      });

      // Assign sequential IDs to unique node names
      Array.from(uniqueNodeNames).forEach((nodeName, index) => {
        nodeIdMap.set(nodeName, `node-${index + 1}`);
      });
    }

    // Now process the predictions to extract balance data
    predictions.forEach((prediction) => {
      if (!prediction.channel_id) return;

      // Extract node name and hash from channel_id
      const channelMatch = prediction.channel_id.match(/lnd-(\w+)_(\w+)/);
      if (!channelMatch || !channelMatch[1] || !channelMatch[2]) return;

      const nodeName = channelMatch[1].toLowerCase();
      const channelHash = channelMatch[2];

      // Get the node ID from our map, or use a fallback
      const nodeId = nodeIdMap.get(nodeName) || nodeName;

      // Create a unique channel identifier
      const channelKey = `${nodeId}_${channelHash}`;

      // Store balance data for the channel
      channelBalances.set(channelKey, {
        nodeId: nodeId,
        channelHash: channelHash,
        channel_id: prediction.channel_id,
        capacity: parseFloat(prediction.capacity || 0),
        localBalance: parseFloat(prediction.local_balance || 0),
        remoteBalance: parseFloat(prediction.remote_balance || 0),
        balanceRatio: parseFloat(prediction.balance_ratio || 0.5),
        optimalRatio: parseFloat(prediction.optimal_ratio || 0.5),
        needsRebalancing:
          Math.abs(
            parseFloat(prediction.balance_ratio || 0.5) -
              parseFloat(prediction.optimal_ratio || 0.5)
          ) > 0.25,
      });
    });

    // Find imbalanced channels
    const imbalancedChannels = Array.from(channelBalances.values()).filter(
      (channel) => channel.needsRebalancing
    );

    // If we have no imbalanced channels, we can't make recommendations
    if (imbalancedChannels.length < 2) return [];

    // Generate route recommendations between nodes with imbalanced channels
    const routeRecs = [];
    const processedNodePairs = new Set();

    imbalancedChannels.forEach((channel1, i) => {
      // Check if this node has connections based on our links data
      const node1Connections =
        nodeConnections.get(channel1.nodeId) || new Set();

      // Loop through all other channels to find potential routes
      imbalancedChannels.forEach((channel2, j) => {
        // Skip same channel or already processed pairs
        if (i === j || channel1.nodeId === channel2.nodeId) return;

        // Create a unique pair identifier to avoid duplicates
        const pairKey = [channel1.nodeId, channel2.nodeId].sort().join('-');
        if (processedNodePairs.has(pairKey)) return;
        processedNodePairs.add(pairKey);

        // Check if these nodes are connected directly or can be connected via another node
        let viaNode = null;

        // Direct connection
        if (node1Connections.has(channel2.nodeId)) {
          // These nodes are directly connected
          viaNode = null;
        } else {
          // Look for a common connection that can serve as an intermediary
          for (const connectedNode of node1Connections) {
            const connectedNodeConnections =
              nodeConnections.get(connectedNode) || new Set();
            if (connectedNodeConnections.has(channel2.nodeId)) {
              viaNode = connectedNode;
              break;
            }
          }
        }

        // Skip if no viable route found
        if (viaNode === null && node1Connections.size === 0) return;

        // If we still don't have a via node but need one, use the first connected node
        // This is a fallback when we don't have complete network topology
        if (viaNode === null && node1Connections.size > 0) {
          viaNode = Array.from(node1Connections)[0];
        }

        // Calculate imbalance and suggested amount
        const imbalance1 =
          Math.abs(channel1.balanceRatio - channel1.optimalRatio) *
          channel1.capacity;
        const imbalance2 =
          Math.abs(channel2.balanceRatio - channel2.optimalRatio) *
          channel2.capacity;
        const suggestedAmount = Math.min(imbalance1, imbalance2) * 0.5; // Use 50% of the smaller imbalance

        // Determine the direction based on balance ratios
        // If channel1 has too much local balance and channel2 has too little, channel1 -> channel2
        // Otherwise channel2 -> channel1
        const direction =
          channel1.balanceRatio > channel1.optimalRatio &&
          channel2.balanceRatio < channel2.optimalRatio
            ? 'forward'
            : 'reverse';

        let fromNode, toNode;
        if (direction === 'forward') {
          fromNode = channel1.nodeId;
          toNode = channel2.nodeId;
        } else {
          fromNode = channel2.nodeId;
          toNode = channel1.nodeId;
        }

        // Create the route recommendation
        const impact =
          suggestedAmount > channel1.capacity * 0.3
            ? 'high'
            : suggestedAmount > channel1.capacity * 0.1
            ? 'medium'
            : 'low';

        routeRecs.push({
          id: `${fromNode}-${viaNode || 'direct'}-${toNode}`,
          fromNode: fromNode,
          viaNode: viaNode || 'direct',
          toNode: toNode,
          outChannel:
            direction === 'forward' ? channel1.channel_id : channel2.channel_id,
          inChannel:
            direction === 'forward' ? channel2.channel_id : channel1.channel_id,
          suggestedAmount: Math.round(suggestedAmount),
          impact: impact,
          reason: 'Rebalancing channels with imbalanced liquidity',
        });
      });
    });

    // Sort recommendations by suggested amount (descending)
    return routeRecs.sort((a, b) => b.suggestedAmount - a.suggestedAmount);
  }, [nodes, links, predictions]);

  // Filter recommendations by selected node if one is chosen
  const filteredRecommendations = useMemo(() => {
    if (!selectedNode) return recommendations;
    return recommendations.filter(
      (rec) =>
        rec.fromNode === selectedNode ||
        (rec.viaNode !== 'direct' && rec.viaNode === selectedNode) ||
        rec.toNode === selectedNode
    );
  }, [recommendations, selectedNode]);

  // Get unique node IDs for the dropdown
  const nodeOptions = useMemo(() => {
    const uniqueNodes = new Set();
    recommendations.forEach((rec) => {
      uniqueNodes.add(rec.fromNode);
      if (rec.viaNode !== 'direct') uniqueNodes.add(rec.viaNode);
      uniqueNodes.add(rec.toNode);
    });
    return Array.from(uniqueNodes).sort();
  }, [recommendations]);

  // Handle node selection change
  const handleNodeChange = (e) => {
    setSelectedNode(e.target.value);
  };

  // Toggle showing detailed or simplified view
  const toggleDetails = () => {
    setShowDetails(!showDetails);
  };

  return (
    <div className='mb-6'>
      <div className='flex items-center mb-4'>
        <svg
          xmlns='http://www.w3.org/2000/svg'
          className='h-6 w-6 mr-2 text-teal-400'
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
        <h2 className='text-xl font-semibold text-teal-300'>
          Route Recommendations
        </h2>
      </div>

      {recommendations.length === 0 ? (
        <div className='bg-gray-800 rounded-lg border border-gray-700 p-8 text-center'>
          <p className='text-gray-400'>
            Insufficient data to generate route recommendations. More network
            activity and channel data is needed.
          </p>
          {predictions.length > 0 && (
            <p className='text-gray-400 mt-2'>
              {predictions.length} prediction records found, but no imbalanced
              channels were identified.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className='flex flex-wrap gap-3 mb-4'>
            <div className='flex-grow'>
              <select
                value={selectedNode}
                onChange={handleNodeChange}
                className='bg-gray-700 text-gray-200 border border-gray-600 rounded-md px-3 py-2 w-full max-w-xs'>
                <option value=''>All Nodes</option>
                {nodeOptions.map((nodeId) => (
                  <option key={nodeId} value={nodeId}>
                    Node {nodeId}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={toggleDetails}
              className='px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md flex items-center'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                className='h-5 w-5 mr-1'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d={
                    showDetails
                      ? 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                      : 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
                  }
                />
              </svg>
              {showDetails ? 'Simplified View' : 'Detailed View'}
            </button>
          </div>

          <div className='bg-gray-800 rounded-lg border border-gray-700 overflow-hidden'>
            <div className='overflow-x-auto'>
              <table className='min-w-full divide-y divide-gray-700'>
                <thead className='bg-gray-700'>
                  <tr>
                    <th
                      scope='col'
                      className='px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider'>
                      Route
                    </th>
                    <th
                      scope='col'
                      className='px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider'>
                      Suggested Amount
                    </th>
                    {showDetails && (
                      <>
                        <th
                          scope='col'
                          className='px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider'>
                          Impact
                        </th>
                        <th
                          scope='col'
                          className='px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider'>
                          Reason
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className='divide-y divide-gray-700 bg-gray-800'>
                  {filteredRecommendations.map((rec) => (
                    <tr key={rec.id} className='hover:bg-gray-750'>
                      <td className='px-4 py-3 whitespace-nowrap'>
                        <div className='flex items-center'>
                          <div className='text-sm text-gray-200'>
                            <div className='font-medium flex items-center'>
                              <span className='bg-blue-900/30 px-2 py-1 rounded-md text-blue-300'>
                                {rec.fromNode}
                              </span>

                              {rec.viaNode !== 'direct' && (
                                <>
                                  <svg
                                    xmlns='http://www.w3.org/2000/svg'
                                    className='h-4 w-4 mx-1 text-gray-400'
                                    fill='none'
                                    viewBox='0 0 24 24'
                                    stroke='currentColor'>
                                    <path
                                      strokeLinecap='round'
                                      strokeLinejoin='round'
                                      strokeWidth={2}
                                      d='M13 5l7 7-7 7M5 5l7 7-7 7'
                                    />
                                  </svg>
                                  <span className='bg-purple-900/30 px-2 py-1 rounded-md text-purple-300'>
                                    {rec.viaNode}
                                  </span>
                                </>
                              )}

                              <svg
                                xmlns='http://www.w3.org/2000/svg'
                                className='h-4 w-4 mx-1 text-gray-400'
                                fill='none'
                                viewBox='0 0 24 24'
                                stroke='currentColor'>
                                <path
                                  strokeLinecap='round'
                                  strokeLinejoin='round'
                                  strokeWidth={2}
                                  d='M13 5l7 7-7 7M5 5l7 7-7 7'
                                />
                              </svg>
                              <span className='bg-green-900/30 px-2 py-1 rounded-md text-green-300'>
                                {rec.toNode}
                              </span>
                            </div>
                            {showDetails && (
                              <div className='text-xs text-gray-400 mt-1'>
                                Channels: {rec.outChannel} → {rec.inChannel}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className='px-4 py-3 whitespace-nowrap'>
                        <div className='text-sm text-gray-200'>
                          <span className='font-medium text-teal-300'>
                            {rec.suggestedAmount.toLocaleString()} sats
                          </span>
                        </div>
                      </td>
                      {showDetails && (
                        <>
                          <td className='px-4 py-3 whitespace-nowrap'>
                            <span
                              className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                              ${
                                rec.impact === 'high'
                                  ? 'bg-green-900/30 text-green-300'
                                  : rec.impact === 'medium'
                                  ? 'bg-yellow-900/30 text-yellow-300'
                                  : 'bg-blue-900/30 text-blue-300'
                              }`}>
                              {rec.impact.charAt(0).toUpperCase() +
                                rec.impact.slice(1)}
                            </span>
                          </td>
                          <td className='px-4 py-3 whitespace-nowrap text-sm text-gray-300'>
                            {rec.reason}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredRecommendations.length === 0 && (
              <div className='text-center py-8'>
                <p className='text-gray-400'>
                  No recommendations found for the selected node.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default RouteRecommendations;
