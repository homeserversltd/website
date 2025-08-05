import React from 'react';
import { TailscaleIndicator } from './TailscaleIndicator';
import { InternetIndicator } from './InternetIndicator';
import { OpenVPNIndicator } from './OpenVPNIndicator';
import { ServicesIndicator } from './ServicesIndicator';
import { PowerMeterIndicator } from './PowerMeterIndicator';
import { withMemoizedIndicator } from './utils';
import './indicators.css';
import '../../styles/common/_buttons.css'; 

// Create memoized versions of all indicators
const MemoizedTailscaleIndicator = withMemoizedIndicator(TailscaleIndicator, 'MemoizedTailscaleIndicator');
const MemoizedInternetIndicator = withMemoizedIndicator(InternetIndicator, 'MemoizedInternetIndicator');
const MemoizedOpenVPNIndicator = withMemoizedIndicator(OpenVPNIndicator, 'MemoizedOpenVPNIndicator');
const MemoizedServicesIndicator = withMemoizedIndicator(ServicesIndicator, 'MemoizedServicesIndicator');
const MemoizedPowerMeterIndicator = withMemoizedIndicator(PowerMeterIndicator, 'MemoizedPowerMeterIndicator');

// Memoize the entire StatusIndicators component
export const StatusIndicators: React.FC = React.memo(() => {
  return (
    <div className="status-indicators">
      <MemoizedTailscaleIndicator />
      <MemoizedInternetIndicator />
      <MemoizedOpenVPNIndicator />
      <MemoizedServicesIndicator />
      <MemoizedPowerMeterIndicator />
    </div>
  );
});

StatusIndicators.displayName = 'StatusIndicators';
