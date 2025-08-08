import React from 'react';

interface OAuthSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
}

const OAuthSetupModal: React.FC<OAuthSetupModalProps> = ({ isOpen, onClose, clientId }) => {
  if (!isOpen) return null;

  const handleCopyClientId = () => {
    navigator.clipboard.writeText(clientId);
  };

  const handleCopyRedirectUrl = () => {
    const redirectUrl = `${window.location.origin}/admin`;
    navigator.clipboard.writeText(redirectUrl);
  };

  const openGoogleCloudConsole = () => {
    window.open('https://console.cloud.google.com/', '_blank');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#1f2937'
          }}>
            Google Classroom OAuth Setup Required
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '4px'
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <p style={{ color: '#6b7280', marginBottom: '16px' }}>
            Your OAuth 2.0 Client ID is configured: <strong>{clientId}</strong>
          </p>
          
          <div style={{
            backgroundColor: '#f3f4f6',
            padding: '12px',
            borderRadius: '4px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                {clientId}
              </span>
              <button
                onClick={handleCopyClientId}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Copy
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '12px' }}>
            To complete the setup, follow these steps:
          </h3>
          
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '16px'
          }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#991b1b' }}>
              <strong>Important:</strong> You also need to get your Client Secret from Google Cloud Console and add it to the code.
            </p>
          </div>
          
          <ol style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
            <li style={{ marginBottom: '8px' }}>
              <strong>Go to Google Cloud Console</strong>
              <button
                onClick={openGoogleCloudConsole}
                style={{
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  marginLeft: '8px'
                }}
              >
                Open Console
              </button>
            </li>
            <li style={{ marginBottom: '8px' }}>
              Navigate to <strong>OAuth consent screen</strong> and add "localhost" to authorized domains
            </li>
            <li style={{ marginBottom: '8px' }}>
              Go to <strong>Credentials → Edit your OAuth 2.0 Client ID</strong>
            </li>
            <li style={{ marginBottom: '8px' }}>
              Add this redirect URL to authorized redirect URIs:
              <div style={{
                backgroundColor: '#f3f4f6',
                padding: '8px',
                borderRadius: '4px',
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                  {window.location.origin}/admin
                </span>
                <button
                  onClick={handleCopyRedirectUrl}
                  style={{
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  Copy
                </button>
              </div>
            </li>
          </ol>
        </div>

        <div style={{
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '4px',
          padding: '12px',
          marginBottom: '20px'
        }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#92400e' }}>
            <strong>Note:</strong> After completing the setup, you may need to wait a few minutes for the changes to take effect. You can then refresh the page and try the Google Classroom integration again.
          </p>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            onClick={() => {
              // Clear OAuth cache
              localStorage.removeItem('google_oauth_token');
              localStorage.removeItem('google_oauth_token_expiry');
              console.log('OAuth cache cleared');
            }}
            style={{
              background: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: 'pointer'
            }}
          >
            Clear Cache
          </button>
          <button
            onClick={onClose}
            style={{
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
          <button
            onClick={() => {
              window.location.reload();
            }}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      </div>
    </div>
  );
};

export default OAuthSetupModal; 