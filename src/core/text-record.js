const ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const validId = id => { if (!ID.test(id || "") || id === "none") throw new Error(`无效 ID：${id}`); return id; };

// Small line protocol: quoted attribute values use the same escaping as VN text.
export function readRecord(line, count, allowed, required = []) {
  let rest = line.trim(), scanned = [];
  while (rest) {
    const m = /^(?:[^\s"\\]|"(?:[^"\\]|\\["\\])*")+/.exec(rest);
    if (!m || (rest[m[0].length] && !/\s/.test(rest[m[0].length]))) throw new Error('参数引号或转义错误。');
    scanned.push(m[0]); rest = rest.slice(m[0].length).trimStart();
  }
  const command = scanned.shift();
  const pos = scanned.splice(0,count);
  if (pos.length !== count) throw new Error(`${command} 缺少 ID。`);
  pos.forEach(validId);
  const attrs = Object.create(null);
  for (const token of scanned) {
    const m = /^(\w+)=(.+)$/.exec(token);
    if (!m || !allowed.includes(m[1]) || Object.hasOwn(attrs,m[1])) throw new Error(`${command} 未知或重复参数：${token}`);
    let value = m[2];
    if (value.startsWith('"')) value = JSON.parse(value);
    else if (/["\\]/.test(value)) throw new Error('属性引号错误。');
    attrs[m[1]] = value;
  }
  for (const key of required) if (!Object.hasOwn(attrs,key) || !attrs[key].trim()) throw new Error(`${command} 缺少非空 ${key}。`);
  return { command, pos, attrs };
}
