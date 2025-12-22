import React, { useCallback } from 'react';
import { Tooltip } from '../components/Tooltip';
import { useWindowSize } from './useWindowSize';

/**
 * Type for tooltip template with generic value types
 */
type TooltipTemplate<T extends Record<string, string | number>> = {
  template: string;
  values: T;
};

/**
 * Union type for possible tooltip content
 */
type TooltipContent = string | TooltipTemplate<Record<string, string | number>>;

/**
 * Configuration options for tooltip display and behavior
 */
export interface UseTooltipOptions {
  /** 
   * Flag to make the tooltip persist on screen 
   * When true, the tooltip will not automatically dismiss
   */
  sticky?: boolean;
  
  /** 
   * Delay in milliseconds before the tooltip appears 
   * Useful for preventing accidental or rapid hover triggers
   */
  delay?: number;
  
  /** 
   * Flag to indicate the tooltip should only update existing tooltip 
   * Prevents creating multiple tooltips for dynamic content
   */
  updateOnly?: boolean;
  
  /**
   * Flag to override mobile detection and force tooltip display
   * Useful for cases where tooltips should be shown regardless of screen size
   */
  forceShowOnMobile?: boolean;
}

interface TooltipProps {
  label: TooltipContent;
  sticky?: boolean;
  delay?: number;
  updateOnly?: boolean;
  children: React.ReactNode;
}

type ShowTooltipFn = (label: TooltipContent, children: React.ReactNode) => React.ReactElement | null;
type ShowDynamicTooltipFn = (template: string, values: Record<string, string | number>, children: React.ReactNode) => React.ReactElement | null;

/**
 * Hook for creating and managing tooltips with flexible configuration
 * @param options - Configuration options for the tooltip
 * @returns An object with a show method to display the tooltip
 */
export const useTooltip = (options: UseTooltipOptions = {}): { show: ShowTooltipFn } => {
  const tooltipProps = {
    sticky: options.sticky,
    delay: options.delay,
    updateOnly: options.updateOnly
  };
  
  // Get current window size to determine if we're on mobile
  const { width } = useWindowSize();
  const isMobile = width <= 480;

  const show = useCallback<ShowTooltipFn>((label, children) => {
    // If on mobile and not forcing tooltips, return children without tooltip
    if (isMobile && !options.forceShowOnMobile) {
      return React.createElement(React.Fragment, {}, children);
    }
    
    return React.createElement(Tooltip, {
      ...tooltipProps,
      label,
      children
    } as TooltipProps);
  }, [tooltipProps.sticky, tooltipProps.delay, tooltipProps.updateOnly, isMobile, options.forceShowOnMobile]);

  return { show };
};

/**
 * Hook for creating dynamic tooltips with template-based content
 * @param options - Additional configuration options for the dynamic tooltip
 * @returns An object with a showDynamic method to display dynamic tooltips
 */
export const useDynamicTooltip = (options: UseTooltipOptions = {}): { showDynamic: ShowDynamicTooltipFn } => {
  const { show } = useTooltip({
    ...options,
    updateOnly: true
  });

  const showDynamic = useCallback<ShowDynamicTooltipFn>((template, values, children) => {
    return show({ template, values }, children);
  }, [show]);

  return { showDynamic };
};

/**
 * Helper hook specifically for status indicators that need responsive tooltips
 * Automatically handles mobile detection and tooltip rendering
 * 
 * @param tooltipContent - The content to display in the tooltip
 * @param options - Additional configuration options for the tooltip
 * @returns A function that wraps the indicator element with a tooltip (or not on mobile)
 */
export const useResponsiveTooltip = (
  tooltipContent: TooltipContent | (() => TooltipContent),
  options: UseTooltipOptions = {}
) => {
  const { show } = useTooltip(options);
  
  // Function to wrap an indicator element with a tooltip
  const wrapWithTooltip = useCallback((element: React.ReactNode) => {
    const content = typeof tooltipContent === 'function' ? tooltipContent() : tooltipContent;
    return show(content, element);
  }, [show, tooltipContent]);
  
  return { wrapWithTooltip };
}; 