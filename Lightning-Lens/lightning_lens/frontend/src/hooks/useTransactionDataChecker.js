import { useEffect } from 'react';

/**
 * Hook to monitor and diagnose transaction flow data
 * This hook helps detect issues with data flowing into the TransactionFlow component
 */
const useTransactionDataChecker = (flowData, componentName) => {
  useEffect(() => {
    // Skip if no data
    if (!flowData) {
      console.log(`[${componentName}] No flow data provided`);
      return;
    }

    // Log data summary
    console.log(`[${componentName}] Flow data summary:`, {
      totalItems: flowData.length,
      isEmpty: flowData.length === 0,
      firstFewItems: flowData.slice(0, 3),
    });

    // Check for common data issues
    if (flowData.length === 0) {
      console.warn(`[${componentName}] Empty flow data detected`);
      return;
    }

    // Check for required fields
    const missingFields = flowData.some(
      (item) => !item.source || !item.target || item.amount === undefined
    );
    if (missingFields) {
      console.error(
        `[${componentName}] Some flow data items are missing required fields (source, target, or amount)`,
        flowData.filter(
          (item) => !item.source || !item.target || item.amount === undefined
        )
      );
    }

    // Check for self-loops
    const selfLoops = flowData.filter((item) => item.source === item.target);
    if (selfLoops.length > 0) {
      console.warn(
        `[${componentName}] ${selfLoops.length} self-loops detected (source === target)`
      );
    }

    // Check for zero or negative values
    const invalidValues = flowData.filter(
      (item) => isNaN(parseFloat(item.amount)) || parseFloat(item.amount) <= 0
    );
    if (invalidValues.length > 0) {
      console.warn(
        `[${componentName}] ${invalidValues.length} items with invalid amounts (NaN, zero, or negative)`
      );
    }

    // Check for potential data type issues
    const stringAmounts = flowData.filter(
      (item) => typeof item.amount === 'string'
    );
    if (stringAmounts.length > 0 && stringAmounts.length === flowData.length) {
      console.info(
        `[${componentName}] All amounts are strings - may need conversion to numbers`
      );
    }

    // Check for circular dependencies
    const edges = new Map();
    flowData.forEach((item) => {
      if (!edges.has(item.source)) {
        edges.set(item.source, new Set());
      }
      edges.get(item.source).add(item.target);
    });

    // Helper function to detect cycles
    const hasCycle = (node, visited = new Set(), path = new Set()) => {
      if (path.has(node)) return true;
      if (visited.has(node)) return false;

      visited.add(node);
      path.add(node);

      const neighbors = edges.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (hasCycle(neighbor, visited, path)) {
          return true;
        }
      }

      path.delete(node);
      return false;
    };

    // Check for cycles in the graph
    const hasCircularDependencies = Array.from(edges.keys()).some((node) =>
      hasCycle(node)
    );
    if (hasCircularDependencies) {
      console.warn(
        `[${componentName}] Circular dependencies detected in the flow data - may cause Sankey diagram issues`
      );
    }

    // Log analysis results instead of returning them
    console.debug(`[${componentName}] Analysis complete`, {
      totalItems: flowData.length,
      hasEmptyData: flowData.length === 0,
      hasMissingFields: missingFields,
      hasSelfLoops: selfLoops.length > 0,
      selfLoopsCount: selfLoops.length,
      hasInvalidValues: invalidValues.length > 0,
      invalidValuesCount: invalidValues.length,
      hasStringAmounts: stringAmounts.length > 0,
      hasCircularDependencies,
    });

    // Don't return anything from the effect
  }, [flowData, componentName]);
};

export default useTransactionDataChecker;
