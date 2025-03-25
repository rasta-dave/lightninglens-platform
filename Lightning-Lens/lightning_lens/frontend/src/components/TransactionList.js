import React from 'react';

const TransactionList = ({ transactions }) => {
  if (!transactions || transactions.length === 0) {
    return (
      <div className='p-4 border border-lightning-blue/20 rounded-lg text-center text-gray-400 bg-dark-node/50'>
        No transactions available yet.
      </div>
    );
  }

  return (
    <div className='overflow-auto max-h-80 scrollbar-thin scrollbar-thumb-lightning-blue/30 scrollbar-track-dark-node'>
      <table className='min-w-full divide-y divide-lightning-blue/20'>
        <thead className='bg-dark-node'>
          <tr>
            <th
              scope='col'
              className='px-3 py-2 text-left text-xs font-medium text-lightning-blue uppercase tracking-wider'>
              Sender
            </th>
            <th
              scope='col'
              className='px-3 py-2 text-left text-xs font-medium text-lightning-blue uppercase tracking-wider'>
              Receiver
            </th>
            <th
              scope='col'
              className='px-3 py-2 text-left text-xs font-medium text-lightning-blue uppercase tracking-wider'>
              Amount
            </th>
            <th
              scope='col'
              className='px-3 py-2 text-left text-xs font-medium text-lightning-blue uppercase tracking-wider'>
              Status
            </th>
          </tr>
        </thead>
        <tbody className='bg-node-background divide-y divide-lightning-blue/10'>
          {transactions.map((transaction, index) => (
            <tr
              key={index}
              className={index === 0 ? 'bg-lightning-blue/10' : ''}>
              <td className='px-3 py-2 whitespace-nowrap text-sm text-satoshi-white'>
                <div className='flex items-center'>
                  <div className='w-2 h-2 rounded-full bg-bitcoin-orange mr-2'></div>
                  {transaction.sender}
                </div>
              </td>
              <td className='px-3 py-2 whitespace-nowrap text-sm text-satoshi-white'>
                <div className='flex items-center'>
                  <div className='w-2 h-2 rounded-full bg-lightning-blue mr-2'></div>
                  {transaction.receiver}
                </div>
              </td>
              <td className='px-3 py-2 whitespace-nowrap text-sm text-channel-yellow font-medium'>
                {transaction.amount}
              </td>
              <td className='px-3 py-2 whitespace-nowrap text-sm'>
                <span
                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    transaction.success === 'True'
                      ? 'bg-node-green bg-opacity-30 text-node-green'
                      : 'bg-warning-red bg-opacity-30 text-warning-red'
                  }`}>
                  {transaction.success === 'True' ? 'Success' : 'Failed'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TransactionList;
