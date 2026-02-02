import React from 'react';

const TradeCard: React.FC = () => {
  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      border: '2px dashed #d1d5db',
      textAlign: 'center'
    }}>
      <div style={{
        fontSize: '2.5rem',
        marginBottom: '1rem'
      }}>
        🔄
      </div>
      <h3 style={{
        margin: '0 0 0.5rem 0',
        fontSize: '1.25rem',
        fontWeight: 'bold',
        color: '#1f2937'
      }}>
        Trades — Under Construction
      </h3>
      <p style={{
        margin: 0,
        fontSize: '0.875rem',
        color: '#6b7280',
        lineHeight: '1.5'
      }}>
        Coming soon: trade PP, artifacts, and items with your squad.
      </p>
    </div>
  );
};

export default TradeCard;


