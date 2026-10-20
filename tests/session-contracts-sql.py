import sqlite3,json,pathlib
conn=sqlite3.connect(':memory:')
conn.executescript('''CREATE TABLE evo_member_attendance_states(unit,evo_member_id,id_activity_session,attendance_date,start_time,activity_name,evo_status,justified_absence,raw_json,synced_at);
CREATE TABLE evo_member_contracts(unit,evo_member_id,contract_key,id_member_membership,start_date,end_date,cancel_date,is_additional,raw_json);''')
conn.executescript(pathlib.Path('migrations/20261020_session_contract_links.sql').read_text())
def contract(unit,mid,key):conn.execute('INSERT INTO evo_member_contracts VALUES(?,?,?,?,?,?,NULL,0,?)',(unit,mid,key,key,'2026-10-20','2026-11-19','{}'))
def session(unit,mid,sid,raw):conn.execute('INSERT INTO evo_member_attendance_states VALUES(?,?,?,?,?,?,0,0,?,NULL)',(unit,mid,sid,'2026-10-22','07:15','Bike',json.dumps(raw)))
contract('bike','1','10');contract('bike','1','11');contract('gym','1','10')
session('bike','1','100',{});session('bike','1','101',{'idMemberMembership':10});session('gym','1','100',{});session('bike','2','100',{});session('bike','1','102',{'idMemberMembership':99})
r=conn.execute('SELECT unit,id_activity_session,confidence,contract_key FROM evo_session_contract_links').fetchall()
assert ('bike','100','ambiguous',None) in r
assert ('bike','101','confirmed','10') in r
assert ('gym','100','probable_unique',None) in r
assert ('bike','100','unmatched',None) in r
assert ('bike','102','unmatched',None) in r
conn.execute("UPDATE evo_member_contracts SET cancel_date='2026-10-21' WHERE unit='bike' AND contract_key='11'")
assert conn.execute("SELECT confidence FROM evo_session_contract_links WHERE unit='bike' AND evo_member_id='1' AND id_activity_session='100'").fetchone()[0]=='probable_unique'
print('PASS: ambiguity, explicit link, unit/member isolation, invalid ID, cancellation refresh')
