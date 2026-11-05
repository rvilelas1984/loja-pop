import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../club-pop-worker.mjs',import.meta.url),'utf8');
test('student failure does not suppress contract and attendance jobs; all tasks settle',async()=>{
 const start=source.indexOf('async scheduled(event, env, ctx)'),end=source.indexOf('async fetch(',start);
 const scheduled=source.slice(start,end).trim().replace(/,$/,'');let calls=[],pending;
 const context={console:{error(){}},captureConquestEvents:async()=>{},getEvoConfig(){}};
 for(const name of ['popDrawTick','journeyAutomationTick','reconcileAbandonedAutomaticRuns','scheduledServiceSales','runScheduledStudentSync','runScheduledContractSync','runScheduledAttendanceSync','luckyDrawTick','runScheduledRegistrationSync','runScheduledReservationSync','runScheduledCatalogSync','backfillMissingAttendanceInstructors','voucherBatchTick','currencyRewardTick','whatsappBirthdayTick','whatsappNewStudentsTick','productSalesTick'])context[name]=async()=>{calls.push(name);if(name==='runScheduledStudentSync')throw Error('temporary failure')};
 context.journeyChatproAdapters=()=>({});const worker=vm.runInNewContext('({'+scheduled+'})',context);
 await worker.scheduled({}, {DB:{}},{waitUntil:p=>pending=p});await pending;
 assert.ok(calls.includes('runScheduledContractSync'));assert.ok(calls.includes('runScheduledAttendanceSync'));assert.ok(calls.includes('runScheduledReservationSync'));
});
