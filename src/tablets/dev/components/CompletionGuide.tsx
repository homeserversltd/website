import React, { useState } from 'react';
import './CompletionGuide.css';

interface Step {
  id: number;
  title: string;
  description: string;
  icon: string;
  details: string[];
  completed?: boolean;
}

export default function CompletionGuide() {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const steps: Step[] = [
    {
      id: 1,
      title: "Copy & Send Password",
      description: "Securely transfer the generated password to the customer",
      icon: "fas fa-key",
      details: [
        "Copy the password from the ~/password.txt card above",
        "Send via secure channel (encrypted email, Signal, etc.)",
        "Confirm customer received and can access their homeserver",
        "Document the handoff in your records"
      ]
    },
    {
      id: 2,
      title: "Verify Results",
      description: "Ensure deployment completed without errors",
      icon: "fas fa-check-circle",
      details: [
        "Review the ~/results.txt output for any error messages",
        "Confirm all services are running properly",
        "Test critical functionality (web interface, key services)",
        "Address any issues before proceeding"
      ]
    },
    {
      id: 3,
      title: "Wipe Deploy Partition",
      description: "Cryptographically destroy deployment artifacts",
      icon: "fas fa-trash-alt",
      details: [
        "Use the 'Wipe Deploy Partition' button above",
        "Confirm the cryptographic destruction completed",
        "Verify encrypted data is now unrecoverable",
        "This ensures no deployment traces remain"
      ]
    },
    {
      id: 4,
      title: "Inspect Deployment Logs",
      description: "Review the wipe operation logs for completeness",
      icon: "fas fa-file-text",
      details: [
        "Check the ~/deployment.log contents above",
        "Verify all destruction steps completed successfully",
        "Note any warnings or issues in the log",
        "Ensure the wipe process was thorough"
      ]
    },
    {
      id: 5,
      title: "Final Wrapup",
      description: "Clean up all remaining deployment artifacts",
      icon: "fas fa-broom",
      details: [
        "Use the 'Finale Wrapup' button above",
        "This removes the wipe script and deployment log",
        "Confirms no deployment tools remain on the system",
        "Leaves the homeserver in production-ready state"
      ]
    },
    {
      id: 6,
      title: "Disable Developer Tab",
      description: "Remove development access and finalize deployment",
      icon: "fas fa-power-off",
      details: [
        "Use the 'Disable Developer Tab' button below",
        "This hides the dev tab from the interface permanently",
        "Requires manual config editing to re-enable",
        "Marks the deployment as officially complete"
      ]
    }
  ];

  const toggleStepCompletion = (stepId: number) => {
    setCompletedSteps(prev => 
      prev.includes(stepId) 
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    );
  };

  const completedCount = completedSteps.length;
  const totalSteps = steps.length;
  const progressPercentage = (completedCount / totalSteps) * 100;

  return (
    <div className="completion-guide">
      <div className="completion-guide-header">
        <div className="completion-guide-title">
          <i className="fas fa-list-check" />
          <h2>Homeserver Deployment Completion Guide</h2>
        </div>
        <div className="completion-guide-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <span className="progress-text">
            {completedCount} of {totalSteps} steps completed
          </span>
        </div>
      </div>

      <div className="completion-guide-description">
        <p>
          Follow these steps in order to properly complete the homeserver deployment and handoff. 
          Each step ensures security, functionality, and professional delivery to your customer.
        </p>
      </div>

      <div className="completion-steps">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isNext = !isCompleted && completedSteps.length === index;
          
          return (
            <div 
              key={step.id} 
              className={`completion-step ${isCompleted ? 'completed' : ''} ${isNext ? 'next' : ''}`}
            >
              <div className="step-header" onClick={() => toggleStepCompletion(step.id)}>
                <div className="step-number">
                  <div className="step-icon">
                    {isCompleted ? (
                      <i className="fas fa-check" />
                    ) : (
                      <i className={step.icon} />
                    )}
                  </div>
                  <span className="step-num">{step.id}</span>
                </div>
                <div className="step-info">
                  <h3 className="step-title">{step.title}</h3>
                  <p className="step-description">{step.description}</p>
                </div>
                <div className="step-toggle">
                  <i className={`fas fa-chevron-${isCompleted ? 'up' : 'down'}`} />
                </div>
              </div>
              
              {isCompleted && (
                <div className="step-details">
                  <ul>
                    {step.details.map((detail, idx) => (
                      <li key={idx}>{detail}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="completion-guide-footer">
        <div className="completion-status">
          {completedCount === totalSteps && (
            <div className="completion-success">
              <i className="fas fa-trophy" />
              <span>Deployment Complete! 🎉</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 