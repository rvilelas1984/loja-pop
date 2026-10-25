import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../admin-novos-alunos.html',import.meta.url),'utf8');
test('scripts da central têm sintaxe válida',()=>{for(const [,s] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(s)});
test('lista separa aceitos de erros e mantém reenvio individual e conflitos escapados',()=>{
 const node={innerHTML:''},ctx={waCurrentPlan:{a:{rule:'new'},items:[{studentId:'1',name:'<script>',status:'failed_before_send',deliveryId:5,retrySafe:true,group:'today',reasons:['falha segura']}],history:[{studentId:'2',name:'Aceito',status:'accepted',deliveryId:6,flowId:'123'}],conflicts:[{studentId:'3',name:'Conflito',reason:'CPF divergente'}]},waPlanTab:'today',waPlanSearch:'',waPlanStatus:'',waPlanLimit:10,waRules:{new:'Cadastro'},waReason:x=>x,waDate:x=>x||'—',clean:x=>String(x??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),$:()=>node};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function waPaintPlanRows(){'),html.indexOf('async function waRetryPlan')),ctx);ctx.waPaintPlanRows();
 assert.ok(node.innerHTML.indexOf('Pendentes e erros')<node.innerHTML.indexOf('Enviados — aceitos pelo ChatPro'));assert.match(node.innerHTML,/waRetryPlan\(5\)/);assert.doesNotMatch(node.innerHTML,/waRetryPlan\(6\)/);assert.match(node.innerHTML,/&lt;script&gt;/);assert.match(node.innerHTML,/Conflitos de identidade/);
});
