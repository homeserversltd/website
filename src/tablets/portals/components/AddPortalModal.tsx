import React, { useState } from 'react';
import { api } from '../../../api/client';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { useToast } from '../../../hooks/useToast';
import { useLoading } from '../../../hooks/useLoading';

interface AddPortalModalProps {
  onClose: () => void;
  onPortalAdded: () => void;
}

interface PortalFormData {
  name: string;
  description: string;
  services: string;
  type: 'systemd' | 'script' | 'link';
  port: string;
  localURL: string;
}

export const AddPortalModal: React.FC<AddPortalModalProps> = ({ onClose, onPortalAdded }) => {
  const { success, error } = useToast();
  const { isLoading, withLoading } = useLoading();
  
  const [formData, setFormData] = useState<PortalFormData>({
    name: '',
    description: '',
    services: '',
    type: 'systemd',
    port: '',
    localURL: ''
  });

  const [errors, setErrors] = useState<Partial<PortalFormData>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<PortalFormData> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Portal name is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    // Services and port are only required for non-link types
    if (formData.type !== 'link') {
      if (!formData.services.trim()) {
        newErrors.services = 'At least one service is required';
      }

      const portNum = parseInt(formData.port);
      if (!formData.port || isNaN(portNum) || portNum <= 0 || portNum > 65535) {
        newErrors.port = 'Port must be a valid number between 1 and 65535';
      }
    }

    if (!formData.localURL.trim()) {
      newErrors.localURL = 'Local URL is required';
    } else if (!formData.localURL.startsWith('http://') && !formData.localURL.startsWith('https://')) {
      newErrors.localURL = 'Local URL must start with http:// or https://';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      const services = formData.type === 'link' 
        ? [] 
        : formData.services.split(',').map(s => s.trim()).filter(s => s);
      
      const portalData: any = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        services,
        type: formData.type,
        localURL: formData.localURL.trim()
      };
      
      // Only include port if not link type
      if (formData.type !== 'link') {
        portalData.port = parseInt(formData.port);
      }

      await withLoading(api.post(API_ENDPOINTS.portals.create, portalData));
      
      success(`Portal "${portalData.name}" created successfully`);
      onPortalAdded();
      onClose();
    } catch (err: any) {
      error(err.message || 'Failed to create portal');
    }
  };

  const handleChange = (field: keyof PortalFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <div className="add-portal-modal">
      <div className="modal-header">
        <h2>Add New Portal</h2>
        <button 
          className="close-button" 
          onClick={onClose}
          aria-label="Close modal"
        >
          <i className="fas fa-times" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="portal-form">
        <div className="form-group">
          <label htmlFor="portal-name">Portal Name *</label>
          <input
            id="portal-name"
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="e.g., MyApp"
            className={errors.name ? 'error' : ''}
          />
          {errors.name && <span className="error-text">{errors.name}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="portal-description">Description *</label>
          <input
            id="portal-description"
            type="text"
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="e.g., My custom application"
            className={errors.description ? 'error' : ''}
          />
          {errors.description && <span className="error-text">{errors.description}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="portal-type">Service Type</label>
          <select
            id="portal-type"
            value={formData.type}
            onChange={(e) => handleChange('type', e.target.value as 'systemd' | 'script' | 'link')}
          >
            <option value="systemd">Systemd Service</option>
            <option value="script">Script-managed Service</option>
            <option value="link">Link Only</option>
          </select>
          <small className="help-text">
            Systemd services can be controlled directly. Script-managed services require system restart. Link-only portals are simple links without service management.
          </small>
        </div>

        {formData.type !== 'link' && (
          <>
            <div className="form-group">
              <label htmlFor="portal-services">Services *</label>
              <input
                id="portal-services"
                type="text"
                value={formData.services}
                onChange={(e) => handleChange('services', e.target.value)}
                placeholder="e.g., myapp, myapp-worker (comma-separated)"
                className={errors.services ? 'error' : ''}
              />
              {errors.services && <span className="error-text">{errors.services}</span>}
              <small className="help-text">Enter service names separated by commas</small>
            </div>

            <div className="form-group">
              <label htmlFor="portal-port">Port *</label>
              <input
                id="portal-port"
                type="number"
                min="1"
                max="65535"
                value={formData.port}
                onChange={(e) => handleChange('port', e.target.value)}
                placeholder="e.g., 8080"
                className={errors.port ? 'error' : ''}
              />
              {errors.port && <span className="error-text">{errors.port}</span>}
            </div>
          </>
        )}

        <div className="form-group">
          <label htmlFor="portal-local-url">Local URL *</label>
          <input
            id="portal-local-url"
            type="url"
            value={formData.localURL}
            onChange={(e) => handleChange('localURL', e.target.value)}
            placeholder="e.g., https://myapp.home.arpa"
            className={errors.localURL ? 'error' : ''}
          />
          {errors.localURL && <span className="error-text">{errors.localURL}</span>}
        </div>

        <div className="form-actions">
          <button type="button" onClick={onClose} className="cancel-button">
            Cancel
          </button>
          <button 
            type="submit" 
            className="submit-button" 
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <i className="fas fa-spinner fa-spin" />
                Creating...
              </>
            ) : (
              <>
                <i className="fas fa-plus" />
                Create Portal
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}; 