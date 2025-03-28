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
  // Define trend icon and color
  let trendIcon = null;
  let trendColorClass = '';

  if (trend === 'up') {
    trendIcon = (
      <svg
        className='w-3 h-3'
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          d='M5 10l7-7m0 0l7 7m-7-7v18'
        />
      </svg>
    );
    trendColorClass = 'text-node-green';
  } else if (trend === 'down') {
    trendIcon = (
      <svg
        className='w-3 h-3'
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          d='M19 14l-7 7m0 0l-7-7m7 7V3'
        />
      </svg>
    );
    trendColorClass = 'text-warning-red';
  } else if (trend === 'neutral') {
    trendIcon = (
      <svg
        className='w-3 h-3'
        fill='none'
        stroke='currentColor'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'>
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

  // Get status color for icon background and subtle border
  const getStatusColor = () => {
    // Check if value is a percentage string
    if (typeof value === 'string' && value.endsWith('%')) {
      const percentage = parseFloat(value);
      if (!isNaN(percentage)) {
        if (percentage >= 90) return 'success';
        if (percentage >= 70) return 'warning';
        if (percentage < 70) return 'danger';
      }
    }

    // Default color based on color prop
    if (color === 'node-green') return 'success';
    if (color === 'channel-yellow' || color === 'bitcoin-orange')
      return 'warning';
    if (color === 'warning-red') return 'danger';

    return 'default'; // Default to blue theme
  };

  const statusClass = getStatusColor();

  // Use a consistent base style with subtle variations based on status
  const baseClass =
    'bg-gradient-to-br from-lightning-blue/10 to-lightning-blue/5 border-lightning-blue/20';
  const successAccent = statusClass === 'success' ? 'border-node-green/30' : '';
  const warningAccent =
    statusClass === 'warning' ? 'border-channel-yellow/30' : '';
  const dangerAccent = statusClass === 'danger' ? 'border-warning-red/30' : '';

  // Use a consistent text color for the value
  const valueTextClass = 'text-satoshi-white';

  // Icon color based on status
  const iconColorClass = {
    default: 'text-lightning-blue',
    success: 'text-node-green',
    warning: 'text-channel-yellow',
    danger: 'text-warning-red',
  };

  return (
    <div
      className={`bg-node-background rounded-lg border p-4 shadow-sm ${baseClass} ${successAccent} ${warningAccent} ${dangerAccent}`}>
      <div className='flex items-center justify-between mb-2'>
        <h3 className='text-sm font-medium text-satoshi-white'>{title}</h3>
        <div
          className={`rounded-md p-2 text-xl ${iconColorClass[statusClass]}`}>
          {icon}
        </div>
      </div>
      <div className='flex items-baseline'>
        <p className={`text-2xl font-bold ${valueTextClass}`}>{value}</p>
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
