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
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
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
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="progress-step-loading">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="20" strokeDashoffset="10" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M2 7L5.5 10.5L12 3"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProgressSteps({ steps, currentStepKey, isError = false }: ProgressStepsProps) {
  const currentIndex = steps.findIndex((s) => s.key === currentStepKey);
  
  // Detecta se é o último step (sucesso final)
  const isFinalSuccess = currentIndex === steps.length - 1 && !isError;
  
  // Filtra para mostrar apenas: anterior (se houver), atual, próximo (se houver)
  const visibleSteps = steps
    .map((step, index) => ({ step, index }))
    .filter(({ index }) => {
      // Mostrar step anterior, atual e próximo
      return index >= currentIndex - 1 && index <= currentIndex + 1;
    });

  // Calcula se há steps ocultos antes/depois
  const hasHiddenBefore = currentIndex > 1;
  const hasHiddenAfter = currentIndex < steps.length - 2;

  return (
    <div className="progress-steps-horizontal">
      {hasHiddenBefore && (
        <div className="progress-step-hidden-indicator">
          <span className="progress-step-hidden-count">{currentIndex - 1}</span>
        </div>
      )}
      
      {visibleSteps.map(({ step, index }, visibleIndex) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        let statusClass = "pending";
        if (isCompleted) statusClass = "completed";
        if (isCurrent && !isError) statusClass = isFinalSuccess ? "success" : "current";
        if (isCurrent && isError) statusClass = "error";

        const isLastVisible = visibleIndex === visibleSteps.length - 1;

        return (
          <div key={step.key} className={`progress-step-h ${statusClass}`}>
            <div className="progress-step-h-icon">
              {isCompleted ? (
                <CheckIcon />
              ) : isCurrent && isError ? (
                <ErrorIcon />
              ) : isCurrent && isFinalSuccess ? (
                <SuccessIcon />
              ) : isCurrent ? (
                <LoadingIcon />
              ) : (
                <span className="progress-step-h-number">{index + 1}</span>
              )}
            </div>
            <span className="progress-step-h-label">{step.label}</span>
            {!isLastVisible && <div className="progress-step-h-line" />}
          </div>
        );
      })}
      
      {hasHiddenAfter && (
        <div className="progress-step-hidden-indicator">
          <span className="progress-step-hidden-count">+{steps.length - currentIndex - 2}</span>
        </div>
      )}
    </div>
  );
}
