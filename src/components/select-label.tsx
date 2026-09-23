/** Radix registers an item's text only once its content has been mounted, so a closed select with a
 * preselected value renders an empty trigger. This renders the label directly instead. */
export function SelectLabel({ children }: { children: React.ReactNode }) {
  return (
    <span data-slot="select-value" className="line-clamp-1">
      {children}
    </span>
  );
}
