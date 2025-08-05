import React from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { SystemControls } from './components/SystemControls';
import { DebugSubscriptions } from './components/DebugSubscriptions';
import { DiskManager } from './components/DiskManager';
import { KeyManager } from './components/KeyManager';

const AdminTablet: React.FC = () => {
  return (
    <ErrorBoundary>
      <div className="admin-tablet">

        <section className="mb-6" style={{ marginBottom: '0.5rem' }}>
          <SystemControls />
        </section>
        
        <section className="mb-6" style={{ marginBottom: '0.5rem' }}>
          <KeyManager />
        </section>
        
        <section className="mb-6" style={{ marginBottom: '0.5rem' }}>
          <DiskManager />
        </section>
        

      </div>
    </ErrorBoundary>
  );
};

export default AdminTablet;