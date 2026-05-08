type Step = {
  key: string;
  label: string;
  description?: string;
};

type ProgressStepsProps = {
  steps: Step[];
  currentStepKey: string;
  isError?: boolean;
};

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 7L5.5 9.5L11 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="progress-step-loading">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="20" strokeDashoffset="10" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressSteps({ steps, currentStepKey, isError = false }: ProgressStepsProps) {
  const currentIndex = steps.findIndex((s) => s.key === currentStepKey);

  return (
    <div className="progress-steps">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isPending = index > currentIndex;

        let statusClass = "pending";
        if (isCompleted) statusClass = "completed";
        if (isCurrent && !isError) statusClass = "current";
        if (isCurrent && isError) statusClass = "error";

        return (
          <div key={step.key} className={`progress-step ${statusClass}`}>
            <div className="progress-step-indicator">
              <div className="progress-step-icon">
                {isCompleted ? (
                  <CheckIcon />
                ) : isCurrent && isError ? (
                  <ErrorIcon />
                ) : isCurrent ? (
                  <LoadingIcon />
                ) : (
                  <span className="progress-step-number">{index + 1}</span>
                )}
              </div>
              {index < steps.length - 1 && <div className="progress-step-line" />}
            </div>
            <div className="progress-step-content">
              <span className="progress-step-label">{step.label}</span>
              {step.description && isCurrent && (
                <span className="progress-step-description">{step.description}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
