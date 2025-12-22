import React from 'react';

// Complementary colors for progress indicator
export const progressColors = [
  '#4285F4', // Google Blue
  '#34A853', // Google Green
  '#FBBC05', // Google Yellow
  '#EA4335', // Google Red
  '#8C44A6', // Purple
  '#16A2D7', // Cyan
];

interface CircularProgressProps {
  keepaliveCount: number;
  size?: number;
  strokeWidth?: number;
  keepalivesPerCycle?: number;
  showLabel?: boolean;
  className?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({ 
  keepaliveCount, 
  size = 40, 
  strokeWidth = 4, 
  keepalivesPerCycle = 10,
  showLabel = true,
  className = ''
}) => {
  // Calculate current cycle and progress within cycle
  const currentCycle = Math.floor(keepaliveCount / keepalivesPerCycle);
  const progressInCycle = (keepaliveCount % keepalivesPerCycle) / keepalivesPerCycle;
  
  // Calculate SVG parameters
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progressInCycle);
  
  return (
    <div className={`circular-progress-container ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
        />
        
        {/* Completed circles for previous cycles */}
        {Array.from({ length: currentCycle }).map((_, index) => (
          <circle
            key={`cycle-${index}`}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={progressColors[index % progressColors.length]}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={0}
            strokeLinecap="round"
          />
        ))}
        
        {/* Current progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={progressColors[currentCycle % progressColors.length]}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      {showLabel && (
        <div className="progress-label">
          {keepaliveCount}
        </div>
      )}
    </div>
  );
};

// CSS to be included when using the CircularProgress component
export const circularProgressCSS = `
.circular-progress-container {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.circular-progress-container svg {
  transform: rotate(-90deg);
  overflow: visible;
}

.progress-label {
  position: absolute;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}
`;

export default CircularProgress;
