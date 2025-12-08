import React, { useRef, useState } from 'react';
import { FileInputProps, ButtonSize } from './types';
import { Button } from './Button';
import '../../styles/common/ui/_file-input.css';

export const FileInput: React.FC<FileInputProps> = ({
  onChange,
  multiple = false,
  accept,
  label,
  disabled = false,
  buttonText = 'Choose Files',
  displayText = 'No file chosen',
  size = 'medium',
  className = '',
  'aria-label': ariaLabel,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const fileArray = Array.from(files);
      setSelectedFiles(fileArray);
      onChange(files);
    } else {
      setSelectedFiles([]);
      onChange(null);
    }
  };

  // Map ComponentSize to ButtonSize (xs -> small, xl -> large)
  const getButtonSize = (componentSize: typeof size): ButtonSize => {
    if (componentSize === 'xs') return 'small';
    if (componentSize === 'xl') return 'large';
    return componentSize as ButtonSize;
  };

  const displayValue = selectedFiles.length > 0
    ? selectedFiles.map(f => f.name).join(', ')
    : displayText;

  return (
    <div className={`ui-file-input ${className}`}>
      {label && (
        <label className="ui-file-input__label">{label}</label>
      )}
      <div className="ui-file-input__controls">
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          onChange={handleFileChange}
          disabled={disabled}
          className="ui-file-input__input"
          aria-label={ariaLabel || label}
        />
        <Button
          variant="primary"
          size={getButtonSize(size)}
          onClick={handleButtonClick}
          disabled={disabled}
          className="ui-file-input__button"
        >
          {buttonText}
        </Button>
        <input
          type="text"
          value={displayValue}
          readOnly
          disabled={disabled}
          className={`ui-file-input__display ui-file-input__display--${size}`}
          aria-label={`Selected files: ${displayValue}`}
        />
      </div>
    </div>
  );
};
