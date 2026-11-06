const GLOBAL_HEADER_INDEX = "forEach((th,i)=>th.addEventListener('click',()=>{const body=th.closest('table').tBodies[0];";
const TABLE_HEADER_INDEX = "forEach(th=>th.addEventListener('click',()=>{const table=th.closest('table');const i=[...table.querySelectorAll('th')].indexOf(th);const body=table.tBodies[0];";

export function scopeTableSorter(html: string): string {
  if (!html.includes(GLOBAL_HEADER_INDEX)) throw new Error('Review HTML is missing its sortable table handler');
  return html.replaceAll(GLOBAL_HEADER_INDEX, TABLE_HEADER_INDEX);
}
