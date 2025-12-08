import React, { useRef, useEffect } from 'react';
import { TextBoxProps } from './types';
import '../../styles/common/ui/_text-box.css';

export const TextBox: React.FC<TextBoxProps> = ({
  variant = 'plain',
  size = 'medium',
  value = '',
  header,
  actions,
  monospace = false,
  scrollable = true,
  autoScroll = false,
  maxHeight,
  placeholder,
  className = '',
  disabled = false,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom when content changes (if enabled)
  useEffect(() => {
    if (autoScroll && scrollable) {
      const element = textAreaRef.current || preRef.current;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    }
  }, [value, autoScroll, scrollable]);

  const textBoxClasses = [
    'ui-text-box',
    `ui-text-box--${variant}`,
    `ui-text-box--${size}`,
    monospace ? 'ui-text-box--monospace' : '',
    !scrollable ? 'ui-text-box--no-scroll' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const contentStyle: React.CSSProperties = {};
  if (maxHeight) {
    contentStyle.maxHeight = maxHeight;
  }

  const contentElement = variant === 'terminal' || variant === 'code' ? (
    <pre
      ref={preRef}
      className="ui-text-box__content"
      style={contentStyle}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      {value || placeholder}
    </pre>
  ) : (
    <textarea
      ref={textAreaRef}
      className="ui-text-box__content"
      value={value}
      readOnly
      disabled={disabled}
      placeholder={placeholder}
      style={contentStyle}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    />
  );

  return (
    <div className={textBoxClasses}>
      {(header || actions) && (
        <div className="ui-text-box__header">
          {header && <div className="ui-text-box__header-title">{header}</div>}
          {actions && <div className="ui-text-box__header-actions">{actions}</div>}
        </div>
      )}
      <div className="ui-text-box__container">{contentElement}</div>
    </div>
  );
};
