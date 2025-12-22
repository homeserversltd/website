import React from 'react';
import './PathBreadcrumb.css';

interface PathBreadcrumbProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  basePath?: string;
}

export const PathBreadcrumb: React.FC<PathBreadcrumbProps> = ({
  currentPath,
  onNavigate,
  basePath = '/mnt/nas'
}) => {
  const pathParts = currentPath.split('/').filter(part => part);
  
  // Ensure we start from basePath
  const baseParts = basePath.split('/').filter(part => part);
  const relativeParts = pathParts.slice(baseParts.length);
  
  const handleClick = (index: number) => {
    if (index === -1) {
      // Clicked on base path
      onNavigate(basePath);
    } else {
      // Build path up to clicked segment
      const targetParts = [...baseParts, ...relativeParts.slice(0, index + 1)];
      const targetPath = '/' + targetParts.join('/');
      onNavigate(targetPath);
    }
  };

  return (
    <nav className="path-breadcrumb" aria-label="Breadcrumb">
      <ol className="breadcrumb-list">
        <li className="breadcrumb-item">
          <button
            className="breadcrumb-link"
            onClick={() => handleClick(-1)}
            type="button"
          >
            {basePath}
          </button>
        </li>
        {relativeParts.map((part, index) => (
          <li key={index} className="breadcrumb-item">
            <span className="breadcrumb-separator">/</span>
            <button
              className="breadcrumb-link"
              onClick={() => handleClick(index)}
              type="button"
            >
              {part}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
};

