import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyConversion,currentJourneyStage,contractCategory} from '../lib/journey-conversion.mjs';
import {deriveJourneyFacts,journeyEvent} from '../lib/journey-data.mjs';
const today='2026-10-28',base={day:'2026-10-25'},contract=(category,name='Plano',startDate='2026-10-25')=>({category,name,startDate,status:'active'});
test('IDs categorize pending students without counting a conversion',()=>{
 for(const [key,category] of [['wellhubId','wellhub'],['totalpassId','totalpass']]){const s=journeyConversion({...base,[key]:'123'},[],today);assert.equal(s.category,category);assert.equal(s.converted,false);assert.equal(s.conversionPending,'Contrato não identificado');assert.equal(currentJourneyStage(s),0);}
});
test('platform conversion requires matching contract AND ID; direct packages and recurring plans qualify',()=>{
 for(const [id,category,key] of [['4','wellhub','wellhubId'],['5','totalpass','totalpassId']]){assert.equal(journeyConversion(base,[contract(id)],today).converted,false);const s=journeyConversion({...base,[key]:'123'},[contract(id)],today);assert.equal(s.converted,true);assert.equal(s.category,category);assert.equal(currentJourneyStage(s),4);}
 for(const name of ['Pacote 8 aulas','Plano recorrente'])assert.equal(journeyConversion(base,[contract('1',name)],today).converted,true);
 assert.equal(contractCategory(contract('','GYMPASS Silver')),'wellhub');assert.equal(contractCategory(contract('','Total Pass TP2')),'totalpass');
});
test('multiple simultaneous contracts give one stable category and preserve first conversion date',()=>{
 const cs=[contract('4','Wellhub','2026-10-25'),contract('5','TotalPass','2026-10-26'),contract('1','Pacote','2026-10-27')],p={...base,wellhubId:'w',totalpassId:'t'};
 const a=journeyConversion(p,cs,today),b=journeyConversion(p,[...cs].reverse(),today);assert.deepEqual(a,b);assert.equal(a.category,'other');assert.equal(a.conversionDay,'2026-10-25');assert.equal(cs.length,3);
});
test('history survives expired contracts; 90 days move exclusively to analysis; future contracts do not convert',()=>{
 const p={...base},c=contract('1','Pacote','2026-07-30');c.status='cancelled';c.endDate='2026-08-30';const s=journeyConversion(p,[c],today);assert.equal(s.converted,true);assert.equal(currentJourneyStage(s),5);assert.equal(s.conversionFollowupDay,90);assert.equal(journeyConversion(p,[contract('1','Futuro','2026-10-29')],today).converted,false);
});
test('202-person cohort has exclusive stages and category sums equal historical conversion',()=>{
 const a=Array.from({length:202},(_,id)=>{const stage=id%6;const s={id,...journeyConversion(base,stage>=4?[contract('1','Plano',stage===5?'2026-07-01':'2026-10-25')]:[],today),attendanceCount:stage===3?2:stage===2?1:0,booking:stage===1?{}:null};s.stage=currentJourneyStage(s);return s;});
 assert.equal(new Set(a.map(x=>x.id)).size,202);assert.equal([0,1,2,3,4,5].reduce((n,stage)=>n+a.filter(x=>x.stage===stage).length,0),202);const converted=a.filter(x=>x.converted);assert.equal(['other','wellhub','totalpass'].reduce((n,c)=>n+converted.filter(x=>x.category===c).length,0),converted.length);assert.ok(converted.length>a.filter(x=>x.stage===4).length);
});
test('automations exclude former stages after conversion or additional attendance',()=>{
 const now=new Date('2026-10-28T15:00:00Z'),p={...base,wellhubId:'w'},attendance=[{day:'2026-10-26',time:'10:00'}];
 const f=deriveJourneyFacts(p,{attendance,bookings:[],contacts:[],contracts:[{category_id:'4',membership_name:'Wellhub',start_date:'2026-10-27'}]},now);assert.equal(journeyEvent('attended',p,f,now),null);assert.ok(journeyEvent('converted',p,f,now));
 const additional=deriveJourneyFacts(base,{attendance:[...attendance,{day:'2026-10-27',time:'10:00'}],bookings:[],contracts:[],contacts:[]},now);assert.equal(journeyEvent('attended',base,additional,now),null);
});
