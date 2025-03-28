import React, { useEffect, useRef } from 'react';
import { useSimulation } from '../../contexts/SimulationContext';
import NetworkHealthDashboard from '../NetworkHealthDashboard';
import TimeSeriesAnalysis from '../TimeSeriesAnalysis';
import RouteRecommendations from '../RouteRecommendations';
import PredictionAnalysis from '../PredictionAnalysis';
import TransactionList from '../TransactionList';
import NetworkGraph from '../improved/NetworkGraph';
import TransactionFlow from '../visualizations/TransactionFlow';

const DashboardContainer = ({ showPredictionsTab }) => {
  const { nodes, links, transactions, flowData, predictions } = useSimulation();
  const mlSectionRef = useRef(null);

  // Scroll to ML section when it becomes visible
  useEffect(() => {
    if (showPredictionsTab && mlSectionRef.current) {
      // Scroll to the ML section with smooth animation
      mlSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [showPredictionsTab]);

  if (nodes.length === 0) {
    return (
      <div className='container mx-auto p-8 text-center text-satoshi-white'>
        <div className='animate-pulse'>
          <p>Waiting for node data...</p>
          <p className='text-sm text-lightning-blue mt-2'>
            Use the controls above to load simulation data
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ML Predictions Section - Placed at the top when active */}
      {showPredictionsTab && (
        <div
          ref={mlSectionRef}
          id='ml-analytics-section'
          className='container mx-auto mb-6'>
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
                  d='M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
                />
              </svg>
              <h2 className='dashboard-header'>Channel Balance Predictions</h2>
            </div>
            <PredictionAnalysis predictions={predictions} />
          </div>
        </div>
      )}

      {/* Network Health Dashboard */}
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

      {/* Time Series Analysis */}
      <div className='container mx-auto mb-6'>
        <div className='dashboard-card'>
          <TimeSeriesAnalysis
            transactions={transactions}
            nodes={nodes}
            links={links}
          />
        </div>
      </div>

      {/* Route Recommendations - Only show if we have predictions */}
      {predictions.length > 0 && (
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

      {/* Main Dashboard Content */}
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
    </>
  );
};

export default DashboardContainer;
