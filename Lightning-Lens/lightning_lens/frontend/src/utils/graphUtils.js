/**
 * Utility functions for graph operations in the TransactionFlow component
 */

/**
 * Detects cycles in a directed graph using depth-first search
 *
 * @param {Object} graph - Adjacency list representation of the graph
 * @param {string} node - Current node to check for cycles
 * @param {Object} path - Object tracking the current DFS path
 * @param {Object} visited - Object tracking all visited nodes
 * @returns {boolean} - True if a cycle is detected, false otherwise
 */
export const hasCycle = (graph, node, path = {}, visited = {}) => {
  if (path[node]) return true;
  if (visited[node]) return false;

  path[node] = true;
  visited[node] = true;

  for (const neighbor of graph[node] || []) {
    if (hasCycle(graph, neighbor, { ...path }, visited)) {
      return true;
    }
  }

  path[node] = false;
  return false;
};

/**
 * Creates an adjacency list representation of a graph from flow data
 *
 * @param {Array} nodes - Array of node objects with id property
 * @param {Array} flowData - Array of flow items with source and target properties
 * @returns {Object} - Adjacency list representation of the graph
 */
export const createGraphFromFlowData = (nodes, flowData) => {
  const graph = {};

  // Initialize empty adjacency lists for all nodes
  nodes.forEach((node) => {
    graph[node.id] = [];
  });

  // Populate adjacency lists from flow data
  flowData.forEach((item) => {
    if (!graph[item.source]) graph[item.source] = [];
    if (!graph[item.source].includes(item.target)) {
      graph[item.source].push(item.target);
    }
  });

  return graph;
};

/**
 * Filter flow data to remove links that would create cycles
 * Uses a more lenient approach to maximize the number of links kept
 *
 * @param {Array} flowData - Array of flow items with source and target
 * @param {Array} nodes - Array of node objects derived from flow data
 * @returns {Object} - Object containing filtered data and stats
 */
export const filterCyclicLinks = (flowData, nodes) => {
  if (!flowData || flowData.length === 0) {
    return {
      safeFlowData: [],
      skippedLinkCount: 0,
      totalLinkCount: 0,
    };
  }

  const totalLinkCount = flowData.length;

  // For Sankey diagrams, we need to remove cycles but we want to keep as many links as possible
  // First, create a directed graph adjacency list
  const graph = createGraphFromFlowData(nodes, flowData);

  // Create a copy of the flow data we can modify
  const workingFlowData = [...flowData];

  // Sort the links by amount (keeping the most significant transactions)
  workingFlowData.sort((a, b) => (b.amount || 0) - (a.amount || 0));

  // Track filtered links
  const safeFlowData = [];
  let skippedLinkCount = 0;

  // First pass - remove self-loops which always cause cycles
  for (let i = 0; i < workingFlowData.length; i++) {
    const item = workingFlowData[i];
    if (item.source === item.target) {
      // This is a self-loop, skip it
      skippedLinkCount++;
      workingFlowData.splice(i, 1);
      i--; // Adjust index after removing element
    }
  }

  // Second pass - process links in order of significance, favoring bigger transactions
  // Keep track of the graph state as we add links
  const workingGraph = {};
  nodes.forEach((node) => {
    workingGraph[node.id] = [];
  });

  // Process all links
  for (const item of workingFlowData) {
    // Add this link to our graph to test if it creates a cycle
    if (!workingGraph[item.source]) workingGraph[item.source] = [];

    // Skip if this link is already in the graph (shouldn't happen with deduplication)
    if (workingGraph[item.source].includes(item.target)) {
      safeFlowData.push(item);
      continue;
    }

    // Add the link and check for cycles
    workingGraph[item.source].push(item.target);

    // Check if this creates a cycle
    let cycleDetected = false;
    const visited = {};
    const currentPath = {};

    // Only check cycles from this specific source node to be more efficient
    // This is a simplification - full cycle detection would check from all nodes
    if (hasCycle(workingGraph, item.source, currentPath, visited)) {
      // Found a cycle, remove this link
      workingGraph[item.source] = workingGraph[item.source].filter(
        (t) => t !== item.target
      );
      skippedLinkCount++;
    } else {
      // No cycle, keep this link
      safeFlowData.push(item);
    }
  }

  // If we've filtered out too many links (more than 80%)
  // use a more aggressive approach to keep some connections
  if (safeFlowData.length < totalLinkCount * 0.2 && totalLinkCount > 10) {
    console.log('Too many filtered links, using simplified approach');

    // Simply keep the top links by amount
    const topLinks = [...flowData]
      .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      .slice(0, Math.max(10, Math.floor(totalLinkCount * 0.2)));

    // Transform these back into a directed graph without self-loops
    return {
      safeFlowData: topLinks.filter((item) => item.source !== item.target),
      skippedLinkCount: totalLinkCount - topLinks.length,
      totalLinkCount,
    };
  }

  return {
    safeFlowData,
    skippedLinkCount,
    totalLinkCount,
  };
};

/**
 * Group transactions by source-target pair for tabular visualization
 *
 * @param {Array} flowData - Array of flow items with source, target, amount and count
 * @returns {Array} - Array of grouped flow items sorted by amount
 */
export const groupTransactionsByPair = (flowData) => {
  if (!flowData || flowData.length === 0) return [];

  // Group transactions by source-target pair
  const txGroups = {};
  flowData.forEach((item) => {
    const key = `${item.source}-${item.target}`;
    if (!txGroups[key]) {
      txGroups[key] = {
        source: item.source,
        target: item.target,
        amount: 0,
        count: 0,
      };
    }
    txGroups[key].amount += item.amount || 0;
    txGroups[key].count += item.count || 1;
  });

  // Convert to array and sort by amount
  return Object.values(txGroups).sort((a, b) => b.amount - a.amount);
};
