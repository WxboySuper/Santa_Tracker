import { describe, expect, it } from 'vitest';
import { scopeTableSorter } from './html';

describe('scopeTableSorter', () => {
  it('indexes each sortable header within its own table', () => {
    const html = "<th>Category</th><th>Actual</th><table><th>Hour</th><th>Stops</th><script>forEach((th,i)=>th.addEventListener('click',()=>{const body=th.closest('table').tBodies[0];rows.sort((a,b)=>a.cells[i].textContent)}));</script>";
    const result = scopeTableSorter(html);

    expect(result).toContain("const i=[...table.querySelectorAll('th')].indexOf(th)");
    expect(result).not.toContain('forEach((th,i)=>');
  });
});
