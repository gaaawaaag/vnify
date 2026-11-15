// Small controls shared by the manager's pages.

export function Segmented<T extends string>({value, options, labels, onChange, small = false, label}: {
  value: T; options: readonly T[]; labels: Record<T, string>; onChange: (value: T) => void; small?: boolean; label?: string;
}) {
  return (
    <div className={small ? 'seg small' : 'seg'} role="group" aria-label={label}>
      {options.map(option => (
        <button key={option} type="button" aria-pressed={option === value} onClick={() => onChange(option)}>{labels[option]}</button>
      ))}
    </div>
  );
}

export function Switch({checked, onChange, label, disabled = false}: {
  checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean;
}) {
  return <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
    onClick={() => onChange(!checked)} />;
}

// A small question mark whose explanation shows on hover or keyboard focus.
export function Hint({text}: {text: string}) {
  return <span className="hint" tabIndex={0}><span aria-hidden="true">?</span><span className="hint-tip" role="tooltip">{text}</span></span>;
}

export function Row({name, help, block = false, children}: {name: string; help?: string; block?: boolean; children: React.ReactNode}) {
  return <div className={block ? 'row block' : 'row'}><span className="name">{name}{help && <Hint text={help} />}</span><div>{children}</div></div>;
}
