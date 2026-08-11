type HintLabelProps = {
  hint?: string;
  children: React.ReactNode;
  className?: string;
};

export function HintLabel({ hint, children, className }: HintLabelProps) {
  if (!hint) return <>{children}</>;

  return (
    <span
      className={["has-hint", className].filter(Boolean).join(" ")}
      data-hint={hint}
      tabIndex={0}
    >
      {children}
    </span>
  );
}
