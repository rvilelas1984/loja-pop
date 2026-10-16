import {headers,norm} from './evo-shop-import.mjs';
// Same SheetJS/official template and expanded used-range handling as aggregators.
export function workbookFor(XLSX,snapshot) {
 const rows=snapshot.map(x=>x.row),ws=XLSX.utils.json_to_sheet(rows,{header:headers}),wb=XLSX.utils.book_new();
 ws['!cols']=[12,35,16,14,35,35,16,20,18,18,20].map(wch=>({wch}));
 rows.forEach((r,i)=>{const c=ws['C'+(i+2)];if(c){c.t='s';c.v=String(r['CPF (CIN)']);c.z='@'}const v=ws['D'+(i+2)];if(v)v.z='0.00';});
 XLSX.utils.book_append_sheet(wb,ws,'Vendas EVO');return wb;
}
function money(v) {
 if(typeof v==='number')return v;
 let s=String(v).replace(/R\$|\s/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return Number(s);
}
function date(XLSX,v) {
 if(typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);return d?String(d.d).padStart(2,'0')+'/'+String(d.m).padStart(2,'0')+'/'+d.y:''}
 const s=String(v||'').trim(),iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(iso)return iso[3]+'/'+iso[2]+'/'+iso[1];
 const br=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return br?br[1].padStart(2,'0')+'/'+br[2].padStart(2,'0')+'/'+br[3]:s;
}
export function readReturn(XLSX,bytes) {
 const wb=XLSX.read(bytes,{type:'array',raw:true});let entries=[],hasSales=false,hasLog=false;
 for(const name of wb.SheetNames){
 const ws=wb.Sheets[name],range=XLSX.utils.decode_range(ws['!ref']||'A1:A1');
 for(const cell of Object.keys(ws)){if(!/^[A-Z]+[0-9]+$/.test(cell))continue;const p=XLSX.utils.decode_cell(cell);range.e.c=Math.max(range.e.c,p.c);range.e.r=Math.max(range.e.r,p.r)}
 if(range.e.r>10000||range.e.c>100)throw Error('Planilha excede o limite de leitura. Envie somente a devolutiva deste lote.');
 ws['!ref']=XLSX.utils.encode_range(range);
 const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false});
 const hi=matrix.findIndex(r=>r.some(v=>norm(v)==='cpfcin')&&r.some(v=>norm(v)==='valor'));if(hi<0)continue;hasSales=true;
 const heads=matrix[hi].map(norm),indexes=headers.map(h=>heads.indexOf(norm(h)));
 if(indexes.slice(0,8).some(i=>i<0))continue;
 let logCol=heads.findIndex(h=>['logdeimportacao','logimportacao','resultadoimportacao','resultadoevo'].includes(h));
 if(logCol<0&&matrix.slice(hi+1).some(r=>/venda\s+(?:n[aã]o\s+)?importada/i.test(String(r[11]||''))))logCol=11;
 if(logCol<0)continue;hasLog=true;
 const found=matrix.slice(hi+1).filter(r=>String(r[logCol]||'').trim()).map(r=>{
 const row=Object.fromEntries(headers.map((h,i)=>[h,indexes[i]<0?'':r[indexes[i]]]));
 row['CPF (CIN)']=String(row['CPF (CIN)']).replace(/\D/g,'').padStart(11,'0');row.VALOR=money(row.VALOR);row.DATA_VENDA=date(XLSX,row.DATA_VENDA);
 return {row,log:String(r[logCol]).trim()};});
 if(found.length>entries.length)entries=found;
 }
 if(!hasSales)throw Error('Nenhuma aba contém CPF (CIN) e VALOR.');
 if(!hasLog)throw Error('Envie a planilha devolvida pela EVO, com as colunas oficiais e a coluna L: Log de importação.');
 if(!entries.length)throw Error('A coluna de resultado está vazia.');
 return entries;
}
