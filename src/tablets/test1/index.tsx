import React from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';

const Test1Tablet: React.FC = () => {
  return (
    <ErrorBoundary>
      <div className="test1-tablet">
        <h2>Test1 Tablet</h2>
        <p>Hello World from Test1 Tablet!</p>
      </div>
    </ErrorBoundary>
  );
};

export default Test1Tablet; 