import React from 'react';

const StatCard = ({
  title,
  value,
  icon,
  subtitle,
  trend,
  trendLabel,
  color = 'lightning-blue',
}) => {
  // Define color classes based on the color prop
  const colorClasses = {
    'lightning-blue':
      'bg-gradient-to-br from-lightning-blue/20 to-lightning-blue/5 text-lightning-blue border-lightning-blue/30',
    'bitcoin-orange':
      'bg-gradient-to-br from-bitcoin-orange/20 to-bitcoin-orange/5 text-bitcoin-orange border-bitcoin-orange/30',
    'lightning-purple':
      'bg-gradient-to-br from-lightning-purple/20 to-lightning-purple/5 text-lightning-purple border-lightning-purple/30',
    'channel-yellow':
      'bg-gradient-to-br from-channel-yellow/20 to-channel-yellow/5 text-channel-yellow border-channel-yellow/30',
    'node-green':
      'bg-gradient-to-br from-node-green/20 to-node-green/5 text-node-green border-node-green/30',
    'warning-red':
      'bg-gradient-to-br from-warning-red/20 to-warning-red/5 text-warning-red border-warning-red/30',
    blue: 'bg-gradient-to-br from-lightning-blue/20 to-lightning-blue/5 text-lightning-blue border-lightning-blue/30',
    green:
      'bg-gradient-to-br from-node-green/20 to-node-green/5 text-node-green border-node-green/30',
    yellow:
      'bg-gradient-to-br from-channel-yellow/20 to-channel-yellow/5 text-channel-yellow border-channel-yellow/30',
    red: 'bg-gradient-to-br from-warning-red/20 to-warning-red/5 text-warning-red border-warning-red/30',
    indigo:
      'bg-gradient-to-br from-lightning-purple/20 to-lightning-purple/5 text-lightning-purple border-lightning-purple/30',
  };

  // Get the appropriate color class or default to lightning-blue
  const colorClass = colorClasses[color] || colorClasses['lightning-blue'];

  // Determine trend icon and color
  let trendIcon = null;
  let trendColorClass = '';

  if (trend) {
    if (trend === 'up') {
      trendIcon = (
        <svg
          xmlns='http://www.w3.org/2000/svg'
          className='h-4 w-4'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'
          />
        </svg>
      );
      trendColorClass = 'text-node-green';
    } else if (trend === 'down') {
      trendIcon = (
        <svg
          xmlns='http://www.w3.org/2000/svg'
          className='h-4 w-4'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6'
          />
        </svg>
      );
      trendColorClass = 'text-warning-red';
    } else if (trend === 'neutral') {
      trendIcon = (
        <svg
          xmlns='http://www.w3.org/2000/svg'
          className='h-4 w-4'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M5 12h14'
          />
        </svg>
      );
      trendColorClass = 'text-channel-yellow';
    }
  }

  return (
    <div
      className={`bg-node-background rounded-lg border p-4 shadow-lightning-glow ${colorClass}`}>
      <div className='flex items-center justify-between mb-2'>
        <h3 className='text-sm font-medium text-satoshi-white'>{title}</h3>
        <div className='rounded-md p-2 text-xl'>{icon}</div>
      </div>
      <div className='flex items-baseline'>
        <p className='text-2xl font-bold text-satoshi-white'>{value}</p>
        {trend && (
          <span
            className={`ml-2 flex items-center text-xs font-medium ${trendColorClass}`}>
            {trendIcon}
            <span className='ml-1'>
              {trendLabel ||
                (trend === 'up' ? '+' : trend === 'down' ? '-' : '±')}
              0%
            </span>
          </span>
        )}
      </div>
      {subtitle && <p className='text-xs text-gray-400 mt-1'>{subtitle}</p>}
    </div>
  );
};

export default StatCard;
