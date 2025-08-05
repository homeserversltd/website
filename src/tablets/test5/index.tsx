import React from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';

const Test5Tablet: React.FC = () => {
  return (
    <ErrorBoundary>
      <div className="test5-tablet">
        <h2>Test5 Tablet</h2>
        <p>Hello World from Test5 Tablet!</p>
      </div>
    </ErrorBoundary>
  );
};

export default Test5Tablet; 