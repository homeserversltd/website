import React from 'react';
import { SliderProps } from './types';
import '../../styles/common/ui/_slider.css';

export const Slider: React.FC<SliderProps> = ({
  min = 0,
  max = 100,
  value,
  onChange,
  onRelease,
  step = 1,
  leftLabel,
  rightLabel,
  size = 'medium',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const sliderId = React.useId();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      const newValue = parseFloat(e.target.value);
      onChange(newValue);
    }
  };

  const handleMouseUp = () => {
    if (!disabled && onRelease) {
      onRelease(value);
    }
  };

  const handleTouchEnd = () => {
    if (!disabled && onRelease) {
      onRelease(value);
    }
  };

  const sliderClasses = [
    'ui-slider',
    `ui-slider--${size}`,
    disabled ? 'ui-slider--disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={sliderClasses}>
      {(leftLabel || rightLabel) && (
        <div className="ui-slider__labels">
          {leftLabel && (
            <span className="ui-slider__label ui-slider__label--left">
              {leftLabel}
            </span>
          )}
          {rightLabel && (
            <span className="ui-slider__label ui-slider__label--right">
              {rightLabel}
            </span>
          )}
        </div>
      )}
      <div className="ui-slider__container">
        <div className="ui-slider__track">
          <div
            className="ui-slider__fill"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          id={sliderId}
          type="range"
          min={min}
          max={max}
          value={value}
          step={step}
          onChange={handleChange}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleTouchEnd}
          disabled={disabled}
          className="ui-slider__input"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
        />
      </div>
    </div>
  );
};
