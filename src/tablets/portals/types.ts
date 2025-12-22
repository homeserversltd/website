export interface PortalService {
    name: string;
    localURL: string;
    remoteURL?: string; // Optional - being phased out for dynamic calculation
    description: string;
    services: string[];
    type?: 'systemd' | 'script' | 'link';
    port?: number; // Optional for 'link' type
    visibility?: boolean;
    status?: string;
    responseTime?: number;
    lastChecked?: number;
}

export interface PortalCategory {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    order: number;
}

export interface PortalGrid {
    categories: PortalCategory[];
    services: PortalService[];
}

export interface ServiceStatus {
    id: string;
    status: 'up' | 'down' | 'unknown';
    responseTime?: number;
    lastChecked: number;
}

export interface PortalConfig {
    refreshInterval?: number;
    gridColumns?: number;
    showResponseTimes?: boolean;
    showLastChecked?: boolean;
}

export interface PortalGridProps {
    portals: PortalService[];
    config?: PortalConfig;
}

export type ServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable';