type IconProps = {
  className?: string;
};

const baseProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const TrashIcon = ({ className }: IconProps = {}) => (
  <svg {...baseProps} className={className}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

export const PencilIcon = ({ className }: IconProps = {}) => (
  <svg {...baseProps} className={className}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const GripIcon = ({ className }: IconProps = {}) => (
  <svg {...baseProps} className={className}>
    <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const SpinnerIcon = ({ className }: IconProps = {}) => (
  <svg
    {...baseProps}
    className={`animate-spin ${className ?? ""}`.trim()}
  >
    <path d="M21 12a9 9 0 1 1-9-9" />
  </svg>
);

export const PlusIcon = ({ className }: IconProps = {}) => (
  <svg {...baseProps} className={className}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

export const ChatIcon = ({ className }: IconProps = {}) => (
  <svg {...baseProps} className={className}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const CloseIcon = ({ className }: IconProps = {}) => (
  <svg {...baseProps} className={className}>
    <path d="M18 6 6 18" />
    <path d="M6 6l12 12" />
  </svg>
);

export const CheckIcon = ({ className }: IconProps = {}) => (
  <svg {...baseProps} className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
