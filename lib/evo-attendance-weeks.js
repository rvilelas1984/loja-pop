// EVO showFullWeek returns Sunday through Saturday, not seven days from date.
export function attendanceWeekStarts(start,end){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(start)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(end)||start>end)throw Error("PERIODO_INVALIDO");
 const [sy,sm]=start.split("-").map(Number),[ey,em]=end.split("-").map(Number);
 const first=new Date(Date.UTC(sy,sm-1,1)),last=new Date(Date.UTC(ey,em,0)),result=[];
 first.setUTCDate(first.getUTCDate()-first.getUTCDay());
 for(let d=first;d<=last;d.setUTCDate(d.getUTCDate()+7))result.push(d.toISOString().slice(0,10));
 return result;
}
