import { inflateRawSync } from 'node:zlib';

const MAX_SIZE=16*1024*1024;
const fail=()=>{throw new Error('EVO_RELATORIO_INVALIDO');};
function unzip(bytes){
  if(bytes.length>MAX_SIZE)fail();
  const end=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if(end<0||end+22>bytes.length)fail();
  const count=bytes.readUInt16LE(end+10);
  let pos=bytes.readUInt32LE(end+16),total=0;
  const files=new Map();
  if(count>100)fail();
  for(let n=0;n<count;n++){
    if(pos+46>bytes.length||bytes.readUInt32LE(pos)!==0x02014b50)fail();
    const flags=bytes.readUInt16LE(pos+8),method=bytes.readUInt16LE(pos+10),compressed=bytes.readUInt32LE(pos+20),size=bytes.readUInt32LE(pos+24);
    const nl=bytes.readUInt16LE(pos+28),xl=bytes.readUInt16LE(pos+30),cl=bytes.readUInt16LE(pos+32),local=bytes.readUInt32LE(pos+42);
    if(flags&1||![0,8].includes(method)||pos+46+nl+xl+cl>bytes.length||local+30>bytes.length||bytes.readUInt32LE(local)!==0x04034b50)fail();
    total+=size;if(total>MAX_SIZE)fail();
    const name=bytes.subarray(pos+46,pos+46+nl).toString('utf8');
    const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
    if(start+compressed>bytes.length||files.has(name))fail();
    const payload=bytes.subarray(start,start+compressed);
    const output=method===0?payload:inflateRawSync(payload,{maxOutputLength:MAX_SIZE});
    if(output.length!==size)fail();
    files.set(name,output.toString('utf8'));
    pos+=46+nl+xl+cl;
  }
  return files;
}
function decode(text){
  return String(text||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi,(s,n,k)=>n?String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[k.toLowerCase()]));
}
const textNodes=xml=>[...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m=>decode(m[1])).join('');
const normalized=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
function spreadsheetRows(files){
  const sheets=[...files.keys()].filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if(sheets.length!==1)fail();
  const shared=[...(files.get('xl/sharedStrings.xml')||'').matchAll(/<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>textNodes(m[1]));
  const rows=[];
  for(const row of files.get(sheets[0]).matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)){
    const values=[];
    for(const cell of row[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)){
      const ref=/\br="([A-Z]+)\d+"/.exec(cell[1]);if(!ref)fail();
      const column=[...ref[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
      const type=/\bt="([^"]+)"/.exec(cell[1])?.[1];
      const value=/<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/.exec(cell[2]||'')?.[1];
      values[column]=type==='s'?shared[Number(value)]:type==='inlineStr'?textNodes(cell[2]||''):decode(value);
      if(type==='s'&&values[column]===undefined)fail();
    }
    rows.push(values);
  }
  const header=rows.findIndex(r=>r.some(v=>['idmember','idcliente'].includes(normalized(v))));
  if(header<0)fail();
  const keys=Array.from(rows[header],normalized);
  return rows.slice(header+1).map(row=>Object.fromEntries(keys.map((key,i)=>[key,row[i]??'']).filter(([key])=>key)));
}
export function parseActiveReport(input){
  const bytes=Buffer.from(input);if(!bytes.length||bytes.length>MAX_SIZE)fail();
  let rows,format;
  if(bytes[0]===0x50&&bytes[1]===0x4b){rows=spreadsheetRows(unzip(bytes));format='xlsx';}
  else{
    const raw=bytes.toString('utf8').trim();
    if(raw.startsWith('[')||raw.startsWith('{')){
      const parsed=JSON.parse(raw);rows=Array.isArray(parsed)?parsed:parsed.data||parsed.items;
      if(!Array.isArray(rows))fail();
      rows=rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[normalized(k),v])));format='json';
    }else fail();
  }
  const members=new Map(),branches=new Set();let records=0;
  for(const row of rows){
    const value=row.idmember??row.idcliente;
    if(value==null||value==='')continue;
    if(!/^\d+$/.test(String(value))||Number(value)<=0)fail();
    const id=String(Number(value)),branch=String(row.idbranch??row.idfilial??'');
    if(!/^\d+$/.test(branch))fail();
    records++;branches.add(branch);members.set(id,{id,branch});
  }
  if(rows.length&&!records)fail();
  return {activeMembers:members.size,records,branchIds:[...branches].map(Number),format,ids:[...members.keys()]};
}
