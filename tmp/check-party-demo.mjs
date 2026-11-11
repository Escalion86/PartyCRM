import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const a=JSON.parse(await readFile('output/demo/local-demo-access.json','utf8'))
const base='http://localhost:3000'
const result=[]
for(const who of ['owner','performer']){
  const login=await fetch(base+'/api/party/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(a[who])})
  assert.equal(login.status,200,who+' login')
  const cookie=login.headers.get('set-cookie').split(';')[0]
  const headers={Cookie:cookie,'x-partycrm-company-id':a.companyId}
  const routes=who==='owner'?['/api/party/memberships','/api/party/orders','/api/party/tasks','/api/party/transactions','/api/party/resource-calendar?dateFrom=2026-11-02T00:00:00%2B07:00&dateTo=2026-11-09T00:00:00%2B07:00&type=location']:['/api/party/performer/orders','/api/party/tasks']
  for(const route of routes){
    const r=await fetch(base+route,{headers}); const data=await r.json()
    assert.equal(r.status,200,`${who} ${route}: ${JSON.stringify(data.error)}`)
    assert.equal(data.success,true)
    const body=data.data
    if(who==='performer'&&route.includes('/performer/orders')){
      assert(!JSON.stringify(body).includes('contractAmount'),'Company finances leaked')
    }
    result.push({who,route,status:r.status,shape:Array.isArray(body)?`array:${body.length}`:Object.keys(body||{}).join(',')})
  }
}
await writeFile('output/demo/api-check.json',JSON.stringify(result,null,2))
console.log(JSON.stringify(result,null,2))
