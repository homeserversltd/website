import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import './tooltip.css';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  ReferenceElement,
  FloatingElement,
} from '@floating-ui/react';

interface TooltipProps {
  label: string | {
    template: string;
    values: Record<string, string | number>;
  };
  children: React.ReactNode;
  sticky?: boolean;
  delay?: number;
  updateOnly?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = React.memo(function Tooltip({ 
  children, 
  label, 
  sticky = false,
  delay = 0,
  updateOnly = false
}: TooltipProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const tooltipRef = useRef<HTMLDivElement | null>(null) as React.MutableRefObject<HTMLDivElement | null>;
  const prevIsOpen = useRef(isOpen);
  
  // Only log when tooltip state changes
  useEffect(() => {
    if (isOpen !== prevIsOpen.current) {
      prevIsOpen.current = isOpen;
    }
  }, [isOpen, label, updateOnly]);

  // Update dynamic values in tooltip without recreating the DOM
  useEffect(() => {
    if (isOpen && tooltipRef.current && typeof label === 'object') {
      const spans = tooltipRef.current.querySelectorAll('[data-value]');
      spans.forEach(span => {
        const key = span.getAttribute('data-value');
        if (key && key in label.values) {
          const oldValue = span.textContent;
          const newValue = String(label.values[key]);
          if (oldValue !== newValue) {
            span.textContent = newValue;
          }
        }
      });
    }
  }, [isOpen, label]);

  // Memoize floating config
  const floatingConfig = useMemo(() => ({
    placement: 'top' as const,
    middleware: [offset(5), flip(), shift()],
    whileElementsMounted: (
      reference: ReferenceElement,
      floating: FloatingElement,
      update: () => void
    ) => {
      if (updateOnly) {
        return autoUpdate(reference, floating, update, {
          animationFrame: true
        });
      }
      return autoUpdate(reference, floating, update);
    },
  }), [updateOnly]);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    ...floatingConfig
  });

  // Memoize interaction hooks
  const hover = useHover(context, {
    handleClose: sticky ? null : undefined,
    delay: delay ? { open: delay, close: 0 } : undefined,
    restMs: delay // Add rest time between hovers
  });
  
  const focus = useFocus(context);
  const dismiss = useDismiss(context, {
    referencePress: !sticky,
  });
  const role = useRole(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  // Memoize floating element style
  const floatingElementStyle = useMemo(() => ({
    ...floatingStyles,
    whiteSpace: 'pre-line' as const,
  }), [floatingStyles]);

  // Create tooltip content based on label type
  const tooltipContent = useMemo(() => {
    if (typeof label === 'string') {
      return label;
    }

    // Replace placeholders with spans that can be updated
    return label.template.replace(/\{(\w+)\}/g, (match, key) => {
      const value = label.values[key];
      return `<span data-value="${key}">${value}</span>`;
    });
  }, [typeof label === 'string' ? label : label.template]);

  // Change the ref assignment to use a callback ref function
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      refs.setFloating(el);
      tooltipRef.current = el;
    },
    [refs.setFloating]
  );

  return (
    <>
      <div ref={refs.setReference} {...getReferenceProps()}>
        {children}
      </div>
      {isOpen && (
        <FloatingPortal>
          <div
            className="tooltip"
            ref={setRefs}
            style={floatingElementStyle}
            {...getFloatingProps()}
            dangerouslySetInnerHTML={{ __html: tooltipContent }}
          />
        </FloatingPortal>
      )}
    </>
  );
});

// Add display name for debugging
Tooltip.displayName = 'Tooltip';