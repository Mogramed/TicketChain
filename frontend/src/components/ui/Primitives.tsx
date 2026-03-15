import { useId, useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";

type Tone = "default" | "success" | "warning" | "danger" | "info";
type RiskTone = "neutral" | "warning" | "error" | "success";

interface Classable {
  className?: string;
}

function joinClassName(...values: Array<string | undefined>): string {
  return values.filter((value) => Boolean(value)).join(" ");
}

export function Panel({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & Classable & { children: ReactNode }) {
  return (
    <section className={joinClassName("ui-panel", className)} {...props}>
      {children}
    </section>
  );
}

export function Card({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & Classable & { children: ReactNode }) {
  return (
    <article className={joinClassName("ui-card", className)} {...props}>
      {children}
    </article>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={joinClassName("ui-section-header", className)}>
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="ui-section-actions">{actions}</div> : null}
    </header>
  );
}

export function PageHeader({
  title,
  subtitle,
  context,
  primaryAction,
  secondaryActions,
  className,
}: {
  title: string;
  subtitle?: string;
  context?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={joinClassName("ui-page-header", className)}>
      <div className="ui-page-header-copy">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
        {context ? <div className="ui-page-header-context">{context}</div> : null}
      </div>
      <div className="ui-page-header-actions">
        {primaryAction ? <div className="ui-page-header-primary">{primaryAction}</div> : null}
        {secondaryActions ? <div className="ui-page-header-secondary">{secondaryActions}</div> : null}
      </div>
    </header>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card className="stat-tile">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </Card>
  );
}

export function Badge({
  tone = "default",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={joinClassName("ui-badge", tone, className)}>{children}</span>;
}

export function Tag({
  tone = "default",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={joinClassName("ui-tag", tone, className)}>{children}</span>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="ui-empty-state">
      <p className="ui-empty-title">{title}</p>
      <p className="ui-empty-description">{description}</p>
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={joinClassName("ui-skeleton", className)} aria-hidden="true" />;
}

export function Toast({
  tone = "default",
  title,
  message,
}: {
  tone?: Tone;
  title: string;
  message: string;
}) {
  return (
    <section className={`ui-toast ${tone}`} role="status" aria-live="polite">
      <p>{title}</p>
      <span>{message}</span>
    </section>
  );
}

export function ButtonGroup({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return <div className={compact ? "ui-button-group compact" : "ui-button-group"}>{children}</div>;
}

export function ActionBar({
  primary,
  secondary,
  children,
  className,
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={joinClassName("ui-action-bar", className)}>
      <div className="ui-action-top">
        {primary ? <div className="ui-action-primary">{primary}</div> : null}
        {secondary ? <div className="ui-action-secondary">{secondary}</div> : null}
      </div>
      {children ? <div className="ui-action-content">{children}</div> : null}
    </Panel>
  );
}

export function InfoList({
  entries,
  className,
}: {
  entries: Array<{ label: string; value: ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={joinClassName("ui-info-list", className)}>
      {entries.map((entry) => (
        <div key={entry.label} className="ui-info-row">
          <dt>{entry.label}</dt>
          <dd>{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RiskBanner({
  tone = "neutral",
  title,
  cause,
  impact,
  action,
}: {
  tone?: RiskTone;
  title: string;
  cause: string;
  impact: string;
  action: string;
}) {
  return (
    <section className={`ui-risk-banner ${tone}`} role="status" aria-live="polite">
      <h3>{title}</h3>
      <p>
        <strong>Cause:</strong> {cause}
      </p>
      <p>
        <strong>Impact:</strong> {impact}
      </p>
      <p>
        <strong>Recommended action:</strong> {action}
      </p>
    </section>
  );
}

export function ProgressStepper({
  steps,
  className,
}: {
  steps: Array<{ label: string; status: "done" | "active" | "upcoming" | "blocked" }>;
  className?: string;
}) {
  return (
    <ol className={joinClassName("ui-progress-stepper", className)}>
      {steps.map((step) => (
        <li key={step.label} className={`ui-step ${step.status}`}>
          <span className="ui-step-dot" aria-hidden="true" />
          <span className="ui-step-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function DetailAccordion({
  title,
  subtitle,
  children,
  defaultOpenDesktop = false,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpenDesktop?: boolean;
  className?: string;
}) {
  const [openByDefault] = useState<boolean>(() => {
    if (!defaultOpenDesktop) {
      return false;
    }
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth >= 940;
  });

  return (
    <details className={joinClassName("ui-detail-accordion", className)} open={openByDefault}>
      <summary>
        <span>{title}</span>
        {subtitle ? <small>{subtitle}</small> : null}
      </summary>
      <div className="ui-detail-content">{children}</div>
    </details>
  );
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel = "View mode",
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const tabListId = useId();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusOption = (index: number) => {
    optionRefs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (options.length <= 1) {
      return;
    }

    let nextIndex = index;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % options.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + options.length) % options.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = options.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    onChange(options[nextIndex]!.value);
    focusOption(nextIndex);
  };

  return (
    <div className={joinClassName("ui-segmented", className)} role="tablist" aria-label={ariaLabel}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "active" : undefined}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
          role="tab"
          id={`${tabListId}-${option.value}`}
          aria-selected={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          ref={(node) => {
            optionRefs.current[index] = node;
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
