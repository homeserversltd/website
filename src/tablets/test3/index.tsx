import React from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';

const Test3Tablet: React.FC = () => {
  return (
    <ErrorBoundary>
      <div className="test3-tablet">
        <h2>Test3 Tablet</h2>
        <p>Hello World from Test3 Tablet!</p>
      </div>
    </ErrorBoundary>
  );
};

export default Test3Tablet; 