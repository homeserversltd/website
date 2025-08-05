import React from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';

const Test4Tablet: React.FC = () => {
  return (
    <ErrorBoundary>
      <div className="test4-tablet">
        <h2>Test4 Tablet</h2>
        <p>Hello World from Test4 Tablet!</p>
      </div>
    </ErrorBoundary>
  );
};

export default Test4Tablet; 