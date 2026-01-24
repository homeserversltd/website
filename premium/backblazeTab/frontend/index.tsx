import React from 'react';
import { TabGroup, Tab } from '../components/TabGroup'; // Assuming TabGroup exists
import './backblazeTab.css';

const BackblazeTab: React.FC = () => {
  return (
    <TabGroup>
      <Tab label="Backblaze">
        <div className="backblazeTab-container">
          <h1>Backblaze Tab</h1>
          <p>Placeholder content for backblazeTab.</p>
        </div>
      </Tab>
    </TabGroup>
  );
};

export default BackblazeTab;