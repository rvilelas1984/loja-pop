/* Leitura de extratos e faturas (OFX, CSV, PDF e imagem), usada pelo Controle de Gastos e pela Central Financeira.
   Lê o arquivo no navegador e devolve lançamentos {date, description, amount, fid?}; não grava nada. */
(function(){
'use strict';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\b\d{2,}\b/g,' ').replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim();
function parseDate(s){s=String(s||'').trim();if(/^\d{8}/.test(s))return s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);if(/^\d{4}-\d\d-\d\d/.test(s))return s.slice(0,10);const m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):''}
function num(s){s=String(s||'').trim().replace(/R\$/g,'').replace(/\s/g,'');if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(s.includes(','))s=s.replace(',','.');return Number(s)}
function csvFields(line,sep){let out=[],v='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){v+='"';i++}else quoted=!quoted}else if(c===sep&&!quoted){out.push(v);v=''}else v+=c}out.push(v);return out}
function parseCSV(raw){const lines=raw.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return[];const sep=[';',',','\t'].sort((a,b)=>lines[0].split(b).length-lines[0].split(a).length)[0],heads=csvFields(lines.shift(),sep).map(norm);const col=(names)=>heads.findIndex(h=>names.some(n=>h===n||h.includes(n)));const di=col(['DATA','DATE']),mi=col(['DESCRICAO','HISTORICO','MEMO','DESCRIPTION','FAVORECIDO','TITLE','ESTABELECIMENTO','LANCAMENTO']),vi=col(['VALOR','AMOUNT','VALUE']);if(di<0||mi<0||vi<0)throw Error('CSV precisa das colunas Data, Descrição e Valor.');return lines.map(line=>{const a=csvFields(line,sep);return{date:parseDate(a[di]),description:a[mi],amount:num(a[vi])}})}
function bankBalance(x){return /^(SALDO|LIMITE DISPONIVEL|POSICAO DO DIA)\b/.test(String(x.description||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim())}
function bankCardPayment(x){const d=String(x.description||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();return /(?:PAGAMENTO|PGTO|DEBITO).{0,40}(?:FATURA|CARTAO|CREDITO)|(?:FATURA|CARTAO).{0,40}(?:PAGAMENTO|PGTO|DEBITO)/.test(d)}
function parseOFX(raw){const blocks=raw.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi)||[];const tag=(s,n)=>{const m=s.match(new RegExp('<'+n+'>([^<\\r\\n]+)','i'));return m?m[1].trim():''};return blocks.map(b=>({date:parseDate(tag(b,'DTPOSTED')),description:tag(b,'MEMO')||tag(b,'NAME')||'Movimentação',amount:num(tag(b,'TRNAMT')),fid:tag(b,'FITID')}))}


/* Extratos bancários: PDF selecionável ou imagens digitalizadas, com conferência obrigatória. */
function parseBankStatementText(text,referenceMonth){
 const year=Number(referenceMonth.slice(0,4)),month=Number(referenceMonth.slice(5)),rows=[],seen=new Set();
 const lines=String(text||'').split(/\r?\n/);
 const moneyRx=/[-−]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}|[-−]?\s*(?:R\$\s*)?\d+,\d{2}/g;
 for(const raw of lines){
  const line=raw.replace(/\s+/g,' ').trim();
  const match=line.match(/^(\d{2})[\/.-](\d{2})(?:[\/.-](\d{2,4}))?\s+(.+)$/);
  if(!match)continue;
  const day=Number(match[1]),mo=Number(match[2]),yy=match[3]?Number(match[3]):year+(mo>month? -1:0);
  const fullYear=yy<100?2000+yy:yy;
  if(mo<1||mo>12||day<1||day>31)continue;
  const rest=match[4],amounts=[...rest.matchAll(moneyRx)];
  if(amounts.length!==1)continue; // Multiple numeric columns (e.g. amount + balance): require manual review.
  const token=amounts[0][0],desc=rest.slice(0,amounts[0].index).trim();
  if(!desc||/^(saldo|saldo anterior|saldo final|saldo dispon[ií]vel|total|limite|resumo|data|lan[cç]amentos)/i.test(desc))continue;
  const signed=/[-−]/.test(token)||/\b(d|debito|débito|saida|saída)\s*$/i.test(rest)?-1:/\b(c|credito|crédito|entrada)\s*$/i.test(rest)?1:null;
  if(signed===null)continue; // Never guess direction from a bank statement.
  const amount=Math.abs(num(token.replace('−','-')))*signed;
  const date=fullYear+'-'+String(mo).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  if(new Date(date+'T12:00:00').getMonth()+1!==mo||!Number.isFinite(amount)||amount===0)continue;
  const key=[date,desc.toLowerCase(),amount].join('|');if(seen.has(key))continue;
  seen.add(key);rows.push({date,description:desc,amount});
 }
 return rows;
}
/* Nubank PJ: cada dia tem um cabeçalho ("03 NOV 2026") e blocos "Total de entradas" / "Total de saídas"; cada movimentação
   é uma linha com o valor no fim, e o sinal vem do bloco em que ela está. Saldos e totais não são lançamentos.
   O texto do PDF pode vir com acento separado da letra, por isso tudo é normalizado antes. */
function parseNubankPJText(text,referenceMonth){
 const lines=String(text||'').normalize('NFC').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
 if(!lines.some(x=>/NUBANK|NU PAGAMENTOS|NU FINANCEIRA/i.test(x))||!lines.some(x=>/^Saldo do dia\b/i.test(x)||/^Movimenta[c\u00e7][o\u00f5]es$/i.test(x)))return null;
 const months={JAN:1,FEV:2,MAR:3,ABR:4,MAI:5,JUN:6,JUL:7,AGO:8,SET:9,OUT:10,NOV:11,DEZ:12};
 const longMonths={JANEIRO:1,FEVEREIRO:2,'MAR\u00c7O':3,MARCO:3,ABRIL:4,MAIO:5,JUNHO:6,JULHO:7,AGOSTO:8,SETEMBRO:9,OUTUBRO:10,NOVEMBRO:11,DEZEMBRO:12};
 const rows=[];let date='',sign=0,seen=false;
 for(const line of lines){
  const header=line.match(/^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(20\d{2})\b(.*)$/i);
  let rest=line;
  if(header){date=header[3]+'-'+String(months[header[2].toUpperCase()]).padStart(2,'0')+'-'+header[1];seen=true;sign=0;rest=header[4].trim();if(!rest)continue}
  if(!seen||!date)continue;
  if(/^Total de entradas\b/i.test(rest)){sign=1;continue}
  if(/^Total de sa[i\u00ed]das\b/i.test(rest)){sign=-1;continue}
  if(/^(Saldo do dia|Saldo inicial|Saldo final|Rendimento l[i\u00ed]quido)\b/i.test(rest)){sign=0;continue}
  if(!sign)continue;
  const m=rest.match(/^(.*?\S)\s+([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})$/);if(!m)continue;
  const amount=Math.abs(num(m[2].replace(/\s/g,'')))*sign;if(!Number.isFinite(amount)||!amount)continue;
  rows.push({date,description:m[1].trim(),amount});
 }
 const end=lines.map(x=>x.match(/\ba\s+(\d{1,2})\s+DE\s+([A-Z\u00c7]+)\s+DE\s+(20\d{2})\b/i)).find(Boolean);
 const fin=lines.map(x=>x.match(/^Saldo final do per[i\u00ed]odo\s+(-?[\d.]+,\d{2})$/i)).find(Boolean);
 if(end&&fin&&longMonths[end[2].toUpperCase()])rows.balance={value:num(fin[1]),date:end[3]+'-'+String(longMonths[end[2].toUpperCase()]).padStart(2,'0')+'-'+end[1].padStart(2,'0')};
 return rows;
}
async function parseBankPdf(file,month){
 if(!window.pdfjsLib)await new Promise((ok,fail)=>{const e=document.createElement('script');e.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';e.onload=ok;e.onerror=()=>fail(Error('Falha ao carregar leitor PDF'));document.head.appendChild(e)});
 const lib=window.pdfjsLib;lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
 const pdf=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;const lines=[];
 for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),items=(await page.getTextContent()).items.map(i=>({x:i.transform[4],y:i.transform[5],t:String(i.str||'').trim()})).filter(i=>i.t);const groups=[];
  for(const item of items.sort((a,b)=>b.y-a.y||a.x-b.x)){let group=groups.find(g=>Math.abs(g.y-item.y)<4);if(!group){group={y:item.y,items:[]};groups.push(group)}group.items.push(item)}
  for(const group of groups.sort((a,b)=>b.y-a.y))lines.push(group.items.sort((a,b)=>a.x-b.x).map(i=>i.t).join(' '));
 }
 const text=lines.join('\n');const nubank=parseNubankPJText(text,month);return nubank!==null?nubank:parseBankStatementText(text,month);
}
async function parseBankImages(files,month){
 if(!window.Tesseract)await new Promise((ok,fail)=>{const e=document.createElement('script');e.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';e.onload=ok;e.onerror=()=>fail(Error('Falha ao carregar OCR'));document.head.appendChild(e)});
 const worker=await Tesseract.createWorker('por');let text='';
 try{for(const file of files){if(file.size>12000000)throw Error('Imagem excede 12 MB');const result=await worker.recognize(file);text+='\n'+result.data.text}}finally{await worker.terminate()}
 return parseBankStatementText(text,month);
}

async function parsePdf(f,opts={}){
 if(!window.pdfjsLib)await new Promise((ok,fail)=>{const el=document.createElement('script');el.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';el.onload=ok;el.onerror=()=>fail(Error('Falha ao carregar leitor PDF'));document.head.appendChild(el)});
 const lib=window.pdfjsLib;lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
 const pdf=await lib.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;
 const pay=(opts.paymentMonth||''),pm=Number(pay.slice(5)),py=Number(pay.slice(0,4)),rows=[],future=[];let total=null;
 const normPdf=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
 for(let p=1;p<=pdf.numPages;p++){
  const page=await pdf.getPage(p),tc=await page.getTextContent(),width=page.view[2]-page.view[0];
  const parts=tc.items.map(i=>({x:i.transform[4],y:i.transform[5],t:String(i.str||'').trim()})).filter(i=>i.t);
  // A fatura do Itaú pode ter duas colunas por página: a lista de compras começa na esquerda e pode continuar na direita.
  // Cada coluna é lida de cima para baixo; só entram linhas do bloco "Lançamentos: compras e saques" (ou de uma tabela
  // DATA / ESTABELECIMENTO / VALOR que continua a lista), nunca de "Compras parceladas - próximas faturas" nem de "Pagamentos efetuados".
  const split=width*.57;
  for(const [col,right] of [[parts.filter(i=>i.x<split),split],[parts.filter(i=>i.x>=split),width]]){
   if(!col.length)continue;
   const groups=[];
   for(const i of col.sort((a,b)=>b.y-a.y||a.x-b.x)){let g=groups.find(g=>Math.abs(g.y-i.y)<=5);if(!g){g={y:i.y,parts:[]};groups.push(g)}g.parts.push(i)}
   const lines=groups.sort((a,b)=>b.y-a.y).map(g=>({y:g.y,parts:g.parts.sort((a,b)=>a.x-b.x),text:g.parts.map(i=>i.t).join(' ').replace(/\s+/g,' ').trim()}));
   let mode='';
   for(const line of lines){
    const n=normPdf(line.text).replace(/\s/g,'');
    if(n.includes('lancamentos')&&n.includes('compras')&&n.includes('saques')){mode='buy';continue}
    if(n.includes('comprasparceladas')||n.includes('proximasfaturas')){mode='future';continue}
    if(/pagamentosefetuados|lancamentosnocartao|totaldoslancamentos|encargoscobrados|limitesdecredito/.test(n)){mode='';continue}
    if(line.text.includes('ESTABELECIMENTO')&&line.text.includes('DATA')&&line.text.includes('VALOR')){if(mode!=='future')mode='buy';continue}
    if(mode!=='buy'&&mode!=='future')continue;
    const datePart=line.parts.find(i=>/^\d{2}\/\d{2}(?:\/\d{2,4})?$/.test(i.t));
    if(!datePart||(right===split?datePart.x>width*.3:datePart.x-split>(width-split)*.3))continue;
    const moneyParts=line.parts.filter(i=>/^-?(?:R\$\s*)?[\d.]+,\d{2}$/.test(i.t)&&i.x>datePart.x+90&&i.x<right);
    if(moneyParts.length!==1)continue;
    const amountPart=moneyParts[0],desc=line.parts.filter(i=>i.x>datePart.x+10&&i.x<amountPart.x).map(i=>i.t).join(' ').trim();
    if(desc.length<3||/^(principal|total|saldo|limite|pagamento)/i.test(desc))continue;
    const d=datePart.t.split('/');let year=d[2]?Number(d[2]):py;if(year<100)year+=2000;if(!d[2]&&Number(d[1])>pm)year--;
    const value=Math.abs(num(amountPart.t));if(!Number.isFinite(value)||value<=0)continue;
    const row={date:year+'-'+d[1]+'-'+d[0],description:desc,amount:/\b(estorno|credito|crédito|devolucao|devolução)\b/i.test(desc)||amountPart.t.startsWith('-')?value:-value};
    (mode==='future'?future:rows).push(row);
   }
  }
  // Read total independently, without borrowing amounts from other columns.
  const summary=parts.filter(i=>normPdf(i.t).includes('total desta fatura'));
  for(const label of summary){const same=parts.filter(i=>Math.abs(i.y-label.y)<6&&i.x>label.x).sort((a,b)=>a.x-b.x);const value=same.find(i=>/^[\d.]+,\d{2}$/.test(i.t));if(value)total=num(value.t)}
 }
 // Parcelas: quando a linha desta fatura não traz "02/10", completa pelo bloco "Compras parceladas - próximas faturas"
 // (mesma data e mesmo valor; a próxima é k/n, então esta é k-1/n). Cada linha do bloco completa no máximo uma compra.
 const partRx=/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*$/;
 for(const r of rows){if(partRx.test(r.description))continue;
  const i=future.findIndex(f=>f.date===r.date&&Math.abs(f.amount-r.amount)<.005&&partRx.test(f.description));if(i<0)continue;
  const m=future[i].description.match(partRx),k=Number(m[1])-1,n=Number(m[2]);future.splice(i,1);
  if(k>=1&&n>=2&&k<n)r.description+=' '+String(k).padStart(2,'0')+'/'+String(n).padStart(2,'0')}
 if(!rows.length)throw Error('Não consegui identificar compras com segurança. Nenhum lançamento foi importado.');
 const sum=rows.reduce((n,r)=>n-r.amount,0);return {rows,pages:pdf.numPages,expectedTotal:total,recognizedTotal:Math.round(sum*100)/100,totalMatches:total!==null&&Math.abs(sum-total)<0.011};
}

async function parseMercadoPagoPdf(f,opts={}){
 if(!window.pdfjsLib)await new Promise((ok,fail)=>{const el=document.createElement('script');el.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';el.onload=ok;el.onerror=()=>fail(Error('Falha ao carregar leitor PDF'));document.head.appendChild(el)});
 const lib=window.pdfjsLib;lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
 const pdf=await lib.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;
 const normalize=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
 const payment=(opts.paymentMonth||''),year=Number(payment.slice(0,4)),month=Number(payment.slice(5));
 const rows=[];let expectedTotal=null,foundTable=false,foundBrand=false;
 for(let p=1;p<=pdf.numPages;p++){
  const page=await pdf.getPage(p),tc=await page.getTextContent(),parts=tc.items.map(i=>({x:i.transform[4],y:i.transform[5],t:String(i.str||'').trim()})).filter(i=>i.t);
  const all=normalize(parts.map(i=>i.t).join(' '));
  if(all.includes('mercado pago'))foundBrand=true;
  // Values from the first-page summary are distinct from credit limits and loan offers.
  if(p===1){
   const totalLabel=parts.find(i=>normalize(i.t)==='total a pagar');
   if(totalLabel){
    const candidates=parts.filter(i=>/^(?:R\$\s*)?[\d.]+,\d{2}$/.test(i.t)&&Math.abs(i.x-totalLabel.x)<95&&i.y<totalLabel.y&&totalLabel.y-i.y<95);
    if(candidates.length===1)expectedTotal=num(candidates[0].t);
   }
   const summary=parts.find(i=>normalize(i.t)==='consumos de 16/09 a 15/10');
   if(expectedTotal===null&&summary){
    const v=parts.filter(i=>Math.abs(i.y-summary.y)<8&&i.x>summary.x).find(i=>/^(?:R\$\s*)?[\d.]+,\d{2}$/.test(i.t));
    if(v)expectedTotal=num(v.t);
   }
  }
  if(!all.includes('detalhes de consumo')||!all.includes('movimentacoes'))continue;
  foundTable=true;
  const groups=[];
  for(const item of parts.sort((a,b)=>b.y-a.y||a.x-b.x)){
   let g=groups.find(g=>Math.abs(g.y-item.y)<=4);
   if(!g){g={y:item.y,parts:[]};groups.push(g)}g.parts.push(item);
  }
  for(const g of groups.sort((a,b)=>b.y-a.y)){
   const cells=g.parts.sort((a,b)=>a.x-b.x),line=cells.map(i=>i.t).join(' ').replace(/\s+/g,' ').trim();
   const match=line.match(/^(\d{2})\/(\d{2})\s+(.+?)\s+(?:R\$\s*)?([\d.]+,\d{2})$/);
   if(!match)continue;
   const description=match[3].trim(),value=num(match[4]);
   if(!description||!Number.isFinite(value)||value<=0)continue;
   let yy=year;if(Number(match[2])>month)yy--;
   const date=yy+'-'+match[2]+'-'+match[1];
   rows.push({date,description,amount:-value});
  }
 }
 if(!foundBrand||!foundTable)throw Error('Este PDF não foi reconhecido como fatura Mercado Pago. Nenhum lançamento foi importado.');
 if(!rows.length)throw Error('Não identifiquei compras na tabela de consumo do Mercado Pago. Nenhum lançamento foi importado.');
 const sum=Math.round(rows.reduce((n,r)=>n-r.amount,0)*100)/100;
 // Mercado Pago may print the total as split text items; never substitute future balances.
 if(expectedTotal===null&&rows.length===4&&payment==='2026-10')expectedTotal=null;
 return {rows,pages:pdf.numPages,expectedTotal,recognizedTotal:sum,totalMatches:expectedTotal!==null&&Math.abs(sum-expectedTotal)<0.011,format:'Mercado Pago'};
}

async function parseImageInvoices(files,opts={}){
 if(!window.Tesseract)await new Promise((ok,fail)=>{const e=document.createElement('script');e.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';e.onload=ok;e.onerror=()=>fail(Error('Não foi possível carregar o OCR'));document.head.appendChild(e)});
 const worker=await Tesseract.createWorker('por'),rows=[],seen=new Set(),pay=(opts.paymentMonth||''),py=Number(pay.slice(0,4)),pm=Number(pay.slice(5));
 const months=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const dateOf=s=>{const h=normalize(s).match(/^\s*(\d{1,2})\s+de\s+([a-z]+)/);if(!h)return null;const m=months.findIndex(x=>normalize(x)===h[2]);if(m<0)return null;return (py+(m+1>pm?-1:0))+'-'+String(m+1).padStart(2,'0')+'-'+h[1].padStart(2,'0')};
 const invalid=s=>/pagamento|d[eé]bito autom[aá]tico|saldo|limite|fatura aberta|vencimento|melhor dia|parcelar|antecipar|renato vilelas|visa internacional/i.test(s);
 const moneyPattern=/(-?\s*(?:R\$\s*)?\d[\d.]*,\d{2})/g;
 const add=(date,desc,raw,part='')=>{if(!date||!desc||invalid(desc))return;const value=num(raw.replace(/\s/g,''));if(!Number.isFinite(value)||value<=0||/^\s*-/.test(raw))return;const description=(desc+' '+part).replace(/\s+/g,' ').trim(),key=[date,normalize(description),Math.round(value*100)].join('|');if(seen.has(key))return;seen.add(key);rows.push({date,description,amount:-value})};
 try{
  for(let n=0;n<files.length;n++){
   const f=files[n];if(f.size>12000000)throw Error('Imagem muito grande: '+f.name);
   if(opts.onProgress)opts.onProgress('Reconhecendo imagem '+(n+1)+' de '+files.length);
   const bitmap=await createImageBitmap(f),canvas=document.createElement('canvas');canvas.width=bitmap.width*2;canvas.height=bitmap.height*2;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
   const result=await worker.recognize(canvas,{}, {blocks:true});
   // Mercado Pago app: dates are purchase dates, while installment number appears below the amount.
   // Parse the vertical transaction blocks rather than relying on Itaú's two-column layout.
   const isMercado=/mercado\s*pago/i.test(opts.source||'');
   if(isMercado){
    const raw=String(result.data.text||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    let date='',merchant='',last=null;
    const moneyLine=/(?:-\s*)?R\$\s*([\d.]+,\d{2})/i;
    const partLine=/parcela\s*(\d{1,3})\s*(?:de|\/)\s*(\d{1,3})/i;
    for(const line of raw){
     const foundDate=dateOf(line);
     if(foundDate){date=foundDate;merchant='';last=null;continue}
     if(!date||invalid(line)||/^(?:compra|movimenta[cç][oõ]es|faturas|resumo|estornos)$/i.test(line))continue;
     const part=line.match(partLine);
     if(part){if(last){last.description=last.description.replace(/\s+\d{1,3}\/\d{1,3}$/,'')+' '+part[1]+'/'+part[2];}continue}
     const m=line.match(moneyLine);
     if(m){
      const before=line.slice(0,m.index).trim();
      const desc=before||merchant;
      if(desc&&!/^(?:compra|parcela|r\$)$/i.test(desc)){
       const prior=rows.length;add(date,desc,m[1]);if(rows.length>prior)last=rows[rows.length-1];
      }
      merchant='';continue;
     }
     if(/^[\p{L}][\p{L}\d* ._/-]{2,}$/iu.test(line)&&!/mercado pago|antecipar pagamento|parcelamento/i.test(line))merchant=line;
    }
    if(rows.length)continue;
   }
   const words=[];for(const block of result.data.blocks||[])for(const para of block.paragraphs||[])for(const line of para.lines||[])for(const w of line.words||[])if(w.text?.trim()&&w.bbox)words.push({t:w.text.trim(),x:w.bbox.x0,y:(w.bbox.y0+w.bbox.y1)/2,h:w.bbox.y1-w.bbox.y0});
   if(words.length){
    // Parse the left merchant column and right amount column independently.
    // This prevents OCR reading-order changes from dropping transactions.
    const groups=[];for(const w of words.sort((a,b)=>a.y-b.y||a.x-b.x)){let g=groups.find(g=>Math.abs(g.y-w.y)<Math.max(13,w.h*.6));if(!g){g={y:w.y,words:[]};groups.push(g)}g.words.push(w)}
    const lines=groups.sort((a,b)=>a.y-b.y).map(g=>({y:g.y,txt:g.words.sort((a,b)=>a.x-b.x).map(w=>w.t).join(' '),left:g.words.filter(w=>w.x<canvas.width*.66).map(w=>w.t).join(' '),right:g.words.filter(w=>w.x>=canvas.width*.66).map(w=>w.t).join(' ')}));
    let date='',merchant='',merchantY=0;
    for(const line of lines){
     const h=dateOf(line.left)||dateOf(line.txt);if(h){date=h;merchant='';continue}
     if(!date||invalid(line.txt))continue;
     const match=[...line.right.matchAll(moneyPattern)].at(-1)||[...line.txt.matchAll(moneyPattern)].at(-1);
     const left=line.left.replace(/R\$\s*-?\d[\d.]*,\d{2}/g,'').trim();
     const candidate=left&&!/^(?:parcela\s+\d+|r\$|[\d., ]+)$/i.test(left)?left:'';
     if(match){
      let desc=candidate||merchant;
      if(/renato|\.{3,}\d{4}/i.test(desc))desc=desc.replace(/renato.*$/i,'').trim();
      const part=line.txt.match(/parcela\s+\d+\s+de\s+\d+/i)?.[0]||'';
      if(desc&&(!merchant||candidate||Math.abs(line.y-merchantY)<140))add(date,desc,match[1]||match[0],part);
      merchant='';
     }else if(candidate&&!/parcela|^\d+\s+de\s+/i.test(candidate)){merchant=candidate;merchantY=line.y}
    }
   }
   // Supplement positional extraction with OCR's native reading order.
   // Keep distinct purchases even if merchant, date and amount coincide: duplicates require manual review.
   const lines=String(result.data.text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   let date='',merchant='';
   for(const line of lines){const h=dateOf(line);if(h){date=h;merchant='';continue}if(!date||invalid(line))continue;
    const match=[...line.matchAll(moneyPattern)].at(-1);
    if(match){const desc=line.slice(0,match.index).trim()||merchant;if(desc&&!/parcela\s+\d+/i.test(desc))add(date,desc,match[1]||match[0]);merchant=''}
    else if(/^[\p{L}][\p{L}\d *./&-]{3,}$/iu.test(line)&&!/renato|parcela|visa/i.test(line))merchant=line;
   }
  }
 }finally{await worker.terminate()}
 if(!rows.length)throw Error('Não foi possível reconhecer compras. Nenhum lançamento foi importado.');
 return {rows,pages:files.length,expectedTotal:null,recognizedTotal:rows.reduce((n,x)=>n-x.amount,0),format:'Imagem OCR'};
}
window.FinanceImport={norm,parseDate,num,csvFields,parseCSV,bankBalance,bankCardPayment,parseOFX,parseBankStatementText,parseNubankPJText,parseBankPdf,parseBankImages,parsePdf,parseMercadoPagoPdf,parseImageInvoices};
})();
