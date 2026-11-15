// Group related diagnostics without losing any affected ID, field or source.
export function issueLines(issues) {
  const groups=new Map();
  for(const {code,message,detail} of issues) {
    const key=JSON.stringify([code,message]);
    if(!groups.has(key))groups.set(key,{message,details:new Set()});
    if(detail)groups.get(key).details.add(detail);
  }
  return [...groups.values()].map(({message,details})=>details.size
    ? `${message}（${details.size} 处）：${[...details].join('；')}` : message);
}

export class ValidationError extends Error {
  constructor(issues,warnings=[]) {
    super(issueLines(issues).join('\n'));
    this.name='ValidationError';this.issues=issues;this.warnings=issueLines(warnings);
  }
}

export function requireValid(issues,warnings=[]) {
  if(issues.length)throw new ValidationError(issues,warnings);
}
