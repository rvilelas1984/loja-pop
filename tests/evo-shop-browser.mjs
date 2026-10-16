// Local fixture-only browser validation. Never contacts production APIs.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium
// SHEETJS_TEST_PATH=/path/to/xlsx.cjs node tests/evo-shop-browser.mjs
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture} from './evo-shop-fixture.mjs';
import {shopImport} from '../lib/evo-shop-import.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE),XLSX=createRequire(import.meta.url)(process.env.SHEETJS_TEST_PATH);
const {db,sql}=fixture();const settings={branchCode:'1',receipts:{pix:15,coins:1,mixed:7}};
for(const u of ['bike','gym'])await shopImport(db,u,'POST',{action:'settings',settings},{});
const errors=[],mutations=[];
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
 let data={ok:true,redemptions:[],orders:[],items:[],products:[],services:[]};
 if(url.pathname==='/api/admin-auth')data={ok:true,role:'admin',units:['bike','gym','club'],permissions:['*']};
 if(url.searchParams.get('route')==='shop-sales-import'){let body='';for await(const part of req)body+=part;if(req.method==='POST')mutations.push(JSON.parse(body).action);data=await shopImport(db,url.searchParams.get('unit'),req.method,body?JSON.parse(body):{}, {name:'Fixture'});}
 else assert.equal(req.method,'GET','No payment mutation allowed');
 res.setHeader('content-type','application/json');res.end(JSON.stringify(data));return;
 }
 if(url.pathname==='/admin-transacoes.html'){res.setHeader('content-type','text/html');res.end('<p>Fixture</p>');return}
 const path=resolve('.'+url.pathname);if(!path.startsWith(resolve('.')+'/'))throw Error('invalid path');
 const file=await readFile(path);res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'}[extname(path)]||'application/octet-stream'));res.end(file);
 }catch(e){res.statusCode=e.status||500;res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:false,error:e.message}))}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',path:process.env.SHEETJS_TEST_PATH}));
 await page.route('https://**',r=>r.request().url().includes('cdn.jsdelivr.net')?r.fallback():r.abort());
 await page.goto(base+'/admin-resgates.html?scope=bike');await page.locator('#cpTabEvo').click();await page.locator('#cpEvoRows td').first().waitFor();
 assert.equal(await page.locator('#cpEvoRows th').count(),13);assert.match(await page.locator('#cpEvoRows').innerText(),/Ana Bike/);assert.match(await page.locator('#cpEvoRows').innerText(),/01234567890/);
 await page.getByRole('button',{name:'Prontas para envio',exact:true}).click();assert.equal(await page.locator('#cpEvoExportRows tbody tr').count(),1);
 const download=page.waitForEvent('download');await page.locator('#cpEvoExport').click();const file=await download,downloadPath=await file.path();
 await page.waitForFunction(()=>document.getElementById('cpEvoExportInfo').textContent.includes('salvo no D1'));
 const wb=XLSX.read(await readFile(downloadPath),{type:'buffer'}),ws=wb.Sheets[wb.SheetNames[0]];assert.equal(ws.C2.v,'01234567890');assert.equal(sql.prepare('SELECT status FROM club_evo_import_items').get().status,'exported');
 ws.L1={t:'s',v:'Log de importação'};ws.L2={t:'s',v:'Venda importada com sucesso'};ws['!ref']='A1:L2';
 const returned='/tmp/evo-shop-validation/return.xlsx';await writeFile(returned,XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));await page.locator('#cpEvoFile').setInputFiles(returned);await page.locator('#cpEvoReturn').click();
 await page.waitForFunction(()=>document.getElementById('cpEvoExportInfo').textContent.includes('1 vendas atualizadas'));
 assert.equal(sql.prepare('SELECT status FROM club_evo_import_items').get().status,'confirmed');assert.equal(await page.locator('#cpEvoExport').isDisabled(),true);
 await page.screenshot({path:'/tmp/evo-shop-validation/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.locator('#cpUnitSelect').selectOption('gym');await page.waitForURL('**scope=gym');await page.locator('#cpTabEvo').click();await page.locator('#cpEvoRows td').first().waitFor();
 assert.match(await page.locator('#cpEvoRows').innerText(),/Ana Gym/);assert.doesNotMatch(await page.locator('#cpEvoRows').innerText(),/Ana Bike/);await page.getByRole('button',{name:'Prontas para envio',exact:true}).click();
 assert.equal(await page.locator('#cpEvoExportRows tbody tr').count(),1);
 const dimensions=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth,table:document.querySelector('#cpEvoRows .cp-evo-scroll').clientWidth}));assert.ok(dimensions.page<=dimensions.viewport+1,JSON.stringify(dimensions));
 await page.screenshot({path:'/tmp/evo-shop-validation/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(mutations,['settings','export','return']);
 console.log(JSON.stringify({ok:true,desktop:'1440x1100',mobile:'390x844',columns:13,exportAndReturn:'confirmed',unitSwitch:'bike to gym',consoleErrors:errors.length,dimensions}));
}finally{await browser.close();await new Promise(r=>server.close(r))}
