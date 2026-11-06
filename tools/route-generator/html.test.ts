import { describe, expect, it } from 'vitest';
import { scopeTableSorter } from './html';

describe('scopeTableSorter', () => {
  it('indexes each sortable header within its own table', () => {
    const handler = "forEach((th,i)=>th.addEventListener('click',()=>{const body=th.closest('table').tBodies[0];rows.sort((a,b)=>a.cells[i].textContent)}));";
    const html = `<table>${handler}</table><table>${handler}</table>`;
    const result = scopeTableSorter(html);

    expect(result).toContain("const i=[...table.querySelectorAll('th')].indexOf(th)");
    expect(result).not.toContain('forEach((th,i)=>');
    expect(result.match(/const i=\[\.\.\.table\.querySelectorAll/g)).toHaveLength(2);
  });

  it('rejects HTML that does not contain the expected handler', () => {
    expect(() => scopeTableSorter('<table></table>')).toThrow(/missing its sortable table handler/);
  });
});
