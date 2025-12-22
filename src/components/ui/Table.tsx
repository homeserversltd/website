import React from 'react';
import { TableProps } from './types';
import '../../styles/common/ui/_table.css';

export const Table: React.FC<TableProps> = ({
  headers,
  rows,
  className = '',
  responsive = true,
  columnSizing,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) => {
  const tableClasses = [
    'ui-table',
    responsive ? 'ui-table--responsive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={tableClasses}>
      <table
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        {headers && headers.length > 0 && (
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th
                  key={index}
                  style={columnSizing?.[index] ? {
                    minWidth: columnSizing[index].minWidth,
                    width: columnSizing[index].width,
                  } : undefined}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  data-label={headers?.[cellIndex]}
                  style={columnSizing?.[cellIndex] ? {
                    minWidth: columnSizing[cellIndex].minWidth,
                    width: columnSizing[cellIndex].width,
                  } : undefined}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
