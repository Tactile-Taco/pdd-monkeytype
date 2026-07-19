// Minimal YAML-subset parser — sufficient for this bundle's sealed
// validators/validation-plan.yaml and validators/validator-set.yaml
// (block maps, block lists, flow lists/maps, scalars, comments).
// NOT a general YAML parser; fails loudly on constructs outside the subset.

function stripComment(line) {
  // comments in these files are always preceded by whitespace ("  # ...")
  const i = line.search(/\s#/);
  return (i >= 0 ? line.slice(0, i) : line).replace(/\s+$/, "");
}

function parseScalar(tok) {
  tok = tok.trim();
  if (tok === "" ) return "";
  if (tok === "true") return true;
  if (tok === "false") return false;
  if (tok === "null" || tok === "~") return null;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(tok)) return Number(tok);
  if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'")))
    return tok.slice(1, -1);
  return tok;
}

function splitFlow(s) {
  // split a flow collection body on top-level commas
  const out = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim() !== "") out.push(cur);
  return out.map((x) => x.trim());
}

function parseValue(tok) {
  tok = tok.trim();
  if (tok.startsWith("[") && tok.endsWith("]")) {
    const body = tok.slice(1, -1).trim();
    return body === "" ? [] : splitFlow(body).map(parseValue);
  }
  if (tok.startsWith("{") && tok.endsWith("}")) {
    const body = tok.slice(1, -1).trim();
    const o = {};
    if (body !== "") for (const part of splitFlow(body)) {
      const i = part.indexOf(":");
      o[part.slice(0, i).trim()] = parseValue(part.slice(i + 1));
    }
    return o;
  }
  return parseScalar(tok);
}

export function parseYamlSubset(text) {
  const lines = text.split("\n")
    .map((raw) => ({ raw, line: stripComment(raw) }))
    .filter((l) => l.line.trim() !== "")
    .map((l) => ({ indent: l.line.match(/^ */)[0].length, text: l.line.trim() }));
  let pos = 0;

  function parseBlock(indent) {
    if (pos >= lines.length) return null;
    if (lines[pos].text.startsWith("- ")) return parseList(indent);
    return parseMap(indent);
  }

  function parseMap(indent) {
    const o = {};
    while (pos < lines.length && lines[pos].indent === indent && !lines[pos].text.startsWith("- ")) {
      const { text } = lines[pos];
      const i = text.indexOf(":");
      if (i < 0) throw new Error("tinyyaml: expected key: at line content " + JSON.stringify(text));
      const key = text.slice(0, i).trim();
      const rest = text.slice(i + 1).trim();
      pos++;
      if (rest !== "") o[key] = parseValue(rest);
      else if (pos < lines.length && lines[pos].indent > indent) o[key] = parseBlock(lines[pos].indent);
      else o[key] = null;
    }
    return o;
  }

  function parseList(indent) {
    const arr = [];
    while (pos < lines.length && lines[pos].indent === indent && lines[pos].text.startsWith("- ")) {
      const itemText = lines[pos].text.slice(2).trim();
      pos++;
      if (itemText === "") {
        arr.push(pos < lines.length && lines[pos].indent > indent ? parseBlock(lines[pos].indent) : null);
      } else if (/^[^:\s][^:]*:\s*/.test(itemText)) {
        // list item that begins an inline map: "- id: bundle-lint" with possible continuation lines
        const i = itemText.indexOf(":");
        const o = {};
        const k = itemText.slice(0, i).trim(), v = itemText.slice(i + 1).trim();
        o[k] = v === "" ? null : parseValue(v);
        if (pos < lines.length && lines[pos].indent > indent) {
          const cont = parseMap(lines[pos].indent);
          Object.assign(o, cont);
        }
        arr.push(o);
      } else {
        arr.push(parseValue(itemText));
      }
    }
    return arr;
  }

  const result = parseBlock(lines[0].indent);
  if (pos !== lines.length) throw new Error("tinyyaml: trailing unparsed content at " + JSON.stringify(lines[pos]));
  return result;
}
