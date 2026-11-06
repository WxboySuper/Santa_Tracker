const GLOBAL_HEADER_INDEX = "forEach((th,i)=>th.addEventListener('click',()=>{const body=th.closest('table').tBodies[0];";
const TABLE_HEADER_INDEX = "forEach(th=>th.addEventListener('click',()=>{const table=th.closest('table');const i=[...table.querySelectorAll('th')].indexOf(th);const body=table.tBodies[0];";

export function scopeTableSorter(html: string): string {
  return html.replace(GLOBAL_HEADER_INDEX, TABLE_HEADER_INDEX);
}
