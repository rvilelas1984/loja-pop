import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { parseActiveReport } from './lib/evo-active-report.js';
import worker from './club-pop-worker.mjs';

function zip(files){
  const local=[],central=[];let offset=0;
  for(const [name,xml] of Object.entries(files)){
    const filename=Buffer.from(name),data=Buffer.from(xml),compressed=deflateRawSync(data);
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(8,8);h.writeUInt32LE(compressed.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(filename.length,26);
    local.push(h,filename,compressed);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(8,10);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);central.push(c,filename);
    offset+=h.length+filename.length+compressed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
const fixture=zip({
 '[Content_Types].xml':'<Types/>',
 'xl/sharedStrings.xml':'<sst><si><t>IdBranch</t></si><si><t>IdMember</t></si></sst>',
 'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>42</v></c><c r="C2"><v>123</v></c></row><row r="3"><c r="A3"><v>42</v></c><c r="C3"><v>123</v></c></row><row r="4"><c r="A4"><v>42</v></c><c r="C4"><v>456</v></c></row></sheetData></worksheet>'
});
assert.deepEqual(parseActiveReport(fixture),{activeMembers:2,records:3,branchIds:[42],format:'xlsx',ids:['123','456']});
assert.equal(parseActiveReport(Buffer.from('[{"IdMember":123,"IdBranch":42}]')).activeMembers,1);
assert.throws(()=>parseActiveReport(Buffer.from('not a report')));
assert.throws(()=>parseActiveReport(fixture.subarray(0,fixture.length-8)));
assert.throws(()=>parseActiveReport(Buffer.from(fixture.toString('utf8'))));
assert.throws(()=>parseActiveReport(zip({'metadata.xml':'<Types/>'})));
const originalFetch=globalThis.fetch;
const cfg={dns:'synthetic',token:'synthetic',expires_at:'2099-12-31',enabled:1};
const purposes=[];
const env={DB:{prepare(sql){let values;return {bind(...v){values=v;return this},async first(){return cfg},async run(){purposes.push(values?.[1]);return {}}}}}};
globalThis.fetch=async()=>new Response(fixture,{headers:{'Content-Type':'application/vnd.ms-excel'}});
const req=new Request('https://worker.invalid/internal/evo-unit',{method:'POST',headers:{'x-evo-timestamp':String(Date.now()),'x-evo-signature':'a'.repeat(64)},body:JSON.stringify({unit:'bike',url:'https://evo-integracao-api.w12app.com.br/api/v2/management/activeclients',method:'GET'})});
const response=await worker.fetch(req,env);
assert.equal(response.status,200);
assert.deepEqual(Buffer.from(await response.arrayBuffer()),fixture);
assert.equal(response.headers.get('content-type'),'application/vnd.ms-excel');
assert.equal(purposes.at(-1),'student_sync');
const apiSource=readFileSync(new URL('./api/evo-config.js',import.meta.url),'utf8')
  .replace('../lib/evo-active-report.js',new URL('./lib/evo-active-report.js',import.meta.url).href)
  .replace('../lib/evo-transport.js',new URL('./lib/evo-transport.js',import.meta.url).href);
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(apiSource).toString('base64'));
function res(){return {code:200,body:null,setHeader(){return this},status(code){this.code=code;return this},json(body){this.body=body;return this},send(body){this.body=body;return this}}}
let calls=0,upstreamCalls=0;
globalThis.fetch=async(url,options)=>{
  calls++;
  if(String(url).includes('/api/admin-auth'))return Response.json({role:'admin',ok:true});
  if(String(url).includes('/internal/evo-unit'))return worker.fetch(new Request(url,options),env);
  upstreamCalls++;return new Response(fixture,{headers:{'Content-Type':'application/vnd.ms-excel'}});
};
const previousKey=process.env.ADMIN_KEY;process.env.ADMIN_KEY='synthetic-test-key';
let out=res();await handler({method:'GET',query:{route:'active-count',unit:'gym'},headers:{}},out);
assert.equal(out.code,423);assert.equal(calls,0);
out=res();await handler({method:'GET',query:{route:'active-count',unit:'bike'},headers:{}},out);
assert.equal(out.code,401);assert.equal(calls,0);
out=res();await handler({method:'GET',query:{route:'active-count',unit:'bike'},headers:{cookie:'synthetic'}},out);
assert.equal(out.code,200);assert.equal(out.body.activeMembers,2);assert.equal(out.body.requests,1);assert.equal(upstreamCalls,1);assert.equal(out.body.ids,undefined);
if(previousKey===undefined)delete process.env.ADMIN_KEY;else process.env.ADMIN_KEY=previousKey;
globalThis.fetch=originalFetch;
if(process.env.EVO_REPORT_FIXTURE){
  const actual=Buffer.from(readFileSync(process.env.EVO_REPORT_FIXTURE,'utf8').trim(),'base64');
  const result=parseActiveReport(actual);
  console.log(JSON.stringify({realReport:true,count:result.activeMembers,records:result.records,format:result.format}));
}
console.log('Parser, transporte binário e fluxo API→Worker→EVO aprovados; Gym e acesso anônimo bloqueados sem chamadas EVO.');
