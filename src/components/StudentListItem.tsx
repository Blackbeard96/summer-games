import React from 'react';

interface Student {
  id: string;
  displayName: string;
  email: string;
  photoURL?: string;
  powerPoints?: number;
  xp?: number;
  level?: number;
}

interface StudentListItemProps {
  student: Student;
  showPowerPoints?: boolean;
  showLevel?: boolean;
  onAdjustPowerPoints?: (studentId: string, adjustment: number) => void;
  onSetPowerPoints?: (studentId: string, amount: number) => void;
  ppInputValue?: number | undefined;
  onPPInputChange?: (studentId: string, value: number | undefined) => void;
  additionalContent?: React.ReactNode;
  compact?: boolean;
}

const StudentListItem: React.FC<StudentListItemProps> = ({
  student,
  showPowerPoints = true,
  showLevel = true,
  onAdjustPowerPoints,
  onSetPowerPoints,
  ppInputValue,
  onPPInputChange,
  additionalContent,
  compact = false
}) => {
  const imageSize = compact ? '32px' : '48px';
  const padding = compact ? '0.5rem' : '1rem';
  const fontSize = compact ? '0.875rem' : '1rem';
  const detailFontSize = compact ? '0.75rem' : '0.875rem';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: padding,
      backgroundColor: '#f9fafb',
      borderRadius: '0.375rem',
      border: compact ? 'none' : '1px solid #e5e7eb'
    }}>
      <img
        src={student.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.displayName)}&background=4f46e5&color=fff&size=64`}
        alt={student.displayName}
        style={{
          width: imageSize,
          height: imageSize,
          borderRadius: '50%',
          objectFit: 'cover'
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ 
          fontSize: fontSize, 
          fontWeight: '600', 
          color: '#1f2937',
          marginBottom: compact ? '0.125rem' : '0.25rem'
        }}>
          {student.displayName}
        </div>
        {showLevel && (
          <div style={{ 
            fontSize: detailFontSize, 
            color: '#6b7280', 
            marginBottom: compact ? '0.125rem' : '0.25rem' 
          }}>
            Level {student.level || 1} • {student.xp || 0} XP
          </div>
        )}
        {showPowerPoints && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ 
              fontSize: detailFontSize, 
              fontWeight: '500', 
              color: '#1f2937' 
            }}>
              {student.powerPoints || 0} PP
            </span>
            {onAdjustPowerPoints && (
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button
                  onClick={() => onAdjustPowerPoints(student.id, 1)}
                  style={{
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    padding: compact ? '0.125rem 0.25rem' : '0.125rem 0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.625rem',
                    fontWeight: 'bold'
                  }}
                  title="Add 1 Power Point"
                  aria-label={`Add 1 power point to ${student.displayName}`}
                >
                  +1
                </button>
                <button
                  onClick={() => onAdjustPowerPoints(student.id, -1)}
                  style={{
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    padding: compact ? '0.125rem 0.375rem' : '0.125rem 0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.625rem',
                    fontWeight: '500'
                  }}
                  title="Remove 1 Power Point"
                  aria-label={`Remove 1 power point from ${student.displayName}`}
                >
                  -
                </button>
                {onSetPowerPoints && onPPInputChange && (
                  <>
                    <input
                      type="number"
                      value={ppInputValue || ''}
                      onChange={(e) => onPPInputChange(student.id, e.target.value ? parseInt(e.target.value) : undefined)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && ppInputValue !== undefined && ppInputValue !== 0) {
                          onSetPowerPoints(student.id, ppInputValue);
                        }
                      }}
                      style={{
                        width: '50px',
                        padding: '0.125rem 0.25rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        fontSize: '0.625rem',
                        textAlign: 'center'
                      }}
                      placeholder="Set"
                      aria-label={`Set power points for ${student.displayName}`}
                    />
                    <button
                      onClick={() => {
                        if (ppInputValue !== undefined && ppInputValue !== 0) {
                          onSetPowerPoints(student.id, ppInputValue);
                        }
                      }}
                      disabled={!ppInputValue || ppInputValue === 0}
                      style={{
                        backgroundColor: ppInputValue && ppInputValue !== 0 ? '#3b82f6' : '#9ca3af',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        padding: '0.125rem 0.375rem',
                        cursor: ppInputValue && ppInputValue !== 0 ? 'pointer' : 'not-allowed',
                        fontSize: '0.625rem',
                        fontWeight: '500'
                      }}
                      title="Set Power Points"
                      aria-label={`Set ${ppInputValue || 0} power points for ${student.displayName}`}
                    >
                      Set
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {additionalContent && (
        <div style={{ marginLeft: 'auto' }}>
          {additionalContent}
        </div>
      )}
    </div>
  );
};

export default StudentListItem;
