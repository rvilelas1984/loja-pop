import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSharedUnitAccess, filterActivitiesBySourceUnit} from './lib/shared-unit-access.mjs';

const today = '2026-10-28';
const contract = (overrides={}) => ({unit:'bike',contractId:'123',status:'active',...overrides});
const rule = (overrides={}) => ({unit:'bike',contractId:'123',enabled:true,...overrides});
const access = (contracts,rules,identityVerified=true) => resolveSharedUnitAccess({contracts,rules,today,identityVerified});

test('contrato elegível ativo libera ambas unidades',()=>{
 assert.deepEqual(access([contract()],[rule()]).units,['bike','gym']);
 assert.equal(access([contract()],[rule()]).shared,true);
});
test('cliente não elegível mantém apenas a unidade original',()=>{
 assert.deepEqual(access([contract()],[rule({contractId:'999'})]).units,['bike']);
});
test('regra desativada revoga acesso adicional sem apagar origem',()=>{
 assert.deepEqual(access([contract()],[rule({enabled:false})]).units,['bike']);
});
test('contrato inativo não habilita nenhuma unidade',()=>{
 assert.deepEqual(access([contract({status:'cancelled'})],[rule()]).units,[]);
});
test('contrato vencido não concede acesso',()=>{
 assert.deepEqual(access([contract({endDate:'2026-10-27'})],[rule()]).units,[]);
});
test('contrato futuro não concede acesso',()=>{
 assert.deepEqual(access([contract({startDate:'2026-10-29'})],[rule()]).units,[]);
});
test('IDs iguais de unidades diferentes não se confundem',()=>{
 assert.deepEqual(access([contract({unit:'gym'})],[rule({unit:'bike'})]).units,['gym']);
});
test('identidade não verificada não ganha permissão',()=>{
 assert.deepEqual(access([contract()],[rule()],false).units,[]);
});
test('múltiplos contratos: um elegível é suficiente',()=>{
 const result=access([contract({contractId:'999'}),contract()],[rule()]);
 assert.deepEqual(result.units,['bike','gym']);
 assert.equal(result.eligibleContracts.length,1);
});
test('histórico é separado por unidade de origem',()=>{
 const rows=[{unit:'bike',stars:3},{unit:'gym',stars:7},{unit:'bike',stars:2}];
 assert.deepEqual(filterActivitiesBySourceUnit(rows,'bike').map(x=>x.stars),[3,2]);
 assert.deepEqual(filterActivitiesBySourceUnit(rows,'gym').map(x=>x.stars),[7]);
});
test('data ausente falha explicitamente',()=>{
 assert.throws(()=>resolveSharedUnitAccess({contracts:[],rules:[],identityVerified:true}),TypeError);
});
