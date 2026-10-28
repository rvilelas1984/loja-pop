// Shared by the D1 journey and its existing WhatsApp engine.
const day=v=>String(v||'').slice(0,10);
export function contractCategory(c){
 const id=String(c.category_id??c.category??''),name=String(c.membership_name??c.name??'');
 if(id==='5')return 'totalpass';
 if(id==='4')return 'wellhub';
 if(/total\s*pass/i.test(name))return 'totalpass';
 if(/wellhub|gympass/i.test(name))return 'wellhub';
 return 'other';
}
export function journeyConversion(person,contracts,today){
 const ids={totalpass:String(person.totalpassId||'').trim(),wellhub:String(person.wellhubId||'').trim()};
 const started=contracts.filter(c=>{const start=day(c.start_date??c.startDate);return /^\d{4}-\d{2}-\d{2}$/.test(start)&&start<=today;});
 // Preserve conversion history after expiration/cancellation; future contracts are not conversions.
 const valid=started.filter(c=>contractCategory(c)==='other'||!!ids[contractCategory(c)]);
 const order=(a,b)=>day(a.start_date??a.startDate).localeCompare(day(b.start_date??b.startDate))||contractCategory(a).localeCompare(contractCategory(b))||String(a.membership_name??a.name??'').localeCompare(String(b.membership_name??b.name??''));
 valid.sort(order);
 const first=valid[0]||null;
 const active=c=>c.active===true||(['1','active','ativo'].includes(String(c.membership_status??c.status??'').toLowerCase())&&(!day(c.end_date??c.endDate)||day(c.end_date??c.endDate)>=today)&&(!day(c.cancel_date??c.cancelDate)||day(c.cancel_date??c.cancelDate)>today));
 // Prefer a validated active contract, then the last validated contract. Stable on API ordering.
 const principal=[...valid].sort((a,b)=>Number(active(b))-Number(active(a))||order(b,a))[0];
 const identified=[...started].sort((a,b)=>Number(active(b))-Number(active(a))||order(b,a))[0];
 const category=principal?contractCategory(principal):ids.totalpass?'totalpass':ids.wellhub?'wellhub':identified?contractCategory(identified):person.source==='opportunity'||person.category==='opportunity'?'opportunity':'other';
 const matching=started.filter(c=>contractCategory(c)===category);
 const conversionDay=first?day(first.start_date??first.startDate):null;
 const followupDay=conversionDay?Math.max(0,Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(conversionDay+'T12:00:00Z'))/86400000)):null;
 return {category,converted:!!first,conversionDay,conversionCategory:principal?contractCategory(principal):null,conversionContract:first,conversionFollowupDay:followupDay,conversionPending:!first&&category!=='opportunity'?(matching.length?'ID da plataforma não identificado':'Contrato não identificado'):null};
}
export function currentJourneyStage(s){
 if(s.converted)return s.conversionFollowupDay>=90?5:4;
 if(Number(s.attendanceCount)>=2)return 3;
 if(s.firstAttendance||Number(s.attendanceCount)>=1)return 2;
 return s.booking?1:0;
}
