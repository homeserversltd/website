import React from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';

const Test2Tablet: React.FC = () => {
  return (
    <ErrorBoundary>
      <div className="test2-tablet">
        <h2>Test2 Tablet</h2>
        <p>Hello World from Test2 Tablet!</p>
      </div>
    </ErrorBoundary>
  );
};

export default Test2Tablet; 