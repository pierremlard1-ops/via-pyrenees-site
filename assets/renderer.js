// Mini-moteur de rendu des composants .dc.html (utilisé au build et, pour le diagnostic, dans le navigateur)
(function (root) {
  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^'.*'$/.test(path)) return path.slice(1, -1);
    const parts = path.split('.');
    let v = scope[parts[0]];
    for (let i = 1; i < parts.length && v != null; i++) v = v[parts[i]];
    return v;
  }
  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  function interp(str, scope) {
    return str.replace(HOLE, (_, p) => { const v = lookup(p, scope); return v == null ? '' : String(v); });
  }
  function attrValue(raw, scope) {
    const m = raw.match(WHOLE);
    return m ? lookup(m[1], scope) : interp(raw, scope);
  }
  const EVT = { onClick: 'click', onChange: 'input', onInput: 'input', onSubmit: 'submit' };

  function createRenderer(opts) {
    // opts: doc, mapHref(href), mapSrc(src), loadComponent(name) -> {tpl: Element(x-dc), Component}, interactive, reuseImport(key)
    const doc = opts.doc;
    let importCounter = 0;
    function renderChildren(parent, scope, out) {
      for (const ch of Array.from(parent.childNodes)) renderNode(ch, scope, out);
    }
    function renderNode(node, scope, out) {
      if (node.nodeType === 3) { out.push(doc.createTextNode(interp(node.nodeValue, scope))); return; }
      if (node.nodeType === 8) return;
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      if (tag === 'helmet') return;
      if (tag === 'sc-for') {
        const list = attrValue(node.getAttribute('list') || '', scope) || [];
        const as = node.getAttribute('as') || 'item';
        list.forEach((item, i) => renderChildren(node, Object.assign({}, scope, { [as]: item, $index: i }), out));
        return;
      }
      if (tag === 'sc-if') {
        if (attrValue(node.getAttribute('value') || '', scope)) renderChildren(node, scope, out);
        return;
      }
      if (tag === 'dc-import') {
        const name = node.getAttribute('name');
        const key = name + '-' + (importCounter++);
        if (opts.reuseImport) { const el = opts.reuseImport(key); if (el) { out.push(el); return; } }
        const props = {};
        for (const a of Array.from(node.attributes)) {
          if (a.name === 'name' || a.name.startsWith('hint-')) continue;
          const camel = a.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          props[camel] = attrValue(a.value, scope);
        }
        const nodes = renderComponent(name, props, null).nodes;
        nodes.forEach(n => { if (n.nodeType === 1) n.setAttribute('data-dc-import', key); out.push(n); });
        return;
      }
      const el = doc.createElement(tag === 'svg' || node.namespaceURI === 'http://www.w3.org/2000/svg' ? tag : tag);
      let svgEl = el;
      if (node.namespaceURI === 'http://www.w3.org/2000/svg') svgEl = doc.createElementNS('http://www.w3.org/2000/svg', node.tagName);
      const target = svgEl;
      let valueAttr = null;
      for (const a of Array.from(node.attributes)) {
        if (a.name.startsWith('hint-')) continue;
        if (/^on[a-z]/i.test(a.name)) {
          const fn = attrValue(a.value, scope);
          if (opts.interactive && typeof fn === 'function') {
            const real = a.name.replace(/^on/i, '').toLowerCase();
            const evName = real === 'change' ? ((tag === 'select' || node.getAttribute('type') === 'checkbox') ? 'change' : 'input') : real;
            target.addEventListener(evName, fn);
          }
          continue;
        }
        let v = attrValue(a.value, scope);
        let name = a.name;
        if (name === 'classname') name = 'class';
        if (['checked', 'disabled', 'selected'].includes(name)) { if (v === false || v === 'false' || v == null) continue; v = ''; }
        if (name === 'value' && (tag === 'textarea' || tag === 'select')) { valueAttr = v; continue; }
        if (typeof v === 'boolean') v = String(v);
        if (name === 'href' && opts.mapHref) v = opts.mapHref(String(v));
        if (name === 'src' && opts.mapSrc) v = opts.mapSrc(String(v));
        target.setAttribute(name, v == null ? '' : String(v));
      }
      const kids = [];
      renderChildren(node, scope, kids);
      kids.forEach(k => target.appendChild(k));
      if (tag === 'textarea' && valueAttr != null) target.textContent = String(valueAttr);
      if (tag === 'select' && valueAttr != null) {
        Array.from(target.querySelectorAll('option')).forEach(o => { if (o.textContent === String(valueAttr)) o.setAttribute('selected', ''); });
      }
      out.push(target);
    }
    function renderComponent(name, props, instance) {
      const c = opts.loadComponent(name);
      const inst = instance || new c.Component(props || {});
      inst.props = props || inst.props || {};
      const vals = inst.renderVals() || {};
      const out = [];
      renderChildren(c.tpl, vals, out);
      return { nodes: out, inst };
    }
    return { renderComponent, resetImports() { importCounter = 0; } };
  }
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; this._listeners = []; }
    setState(patch) { this.state = Object.assign({}, this.state, typeof patch === 'function' ? patch(this.state) : patch); if (this.onUpdate) this.onUpdate(); }
    forceUpdate() { if (this.onUpdate) this.onUpdate(); }
  }
  const api = { createRenderer, DCLogic, interp, lookup };
  if (typeof module !== 'undefined') module.exports = api; else root.DCRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
