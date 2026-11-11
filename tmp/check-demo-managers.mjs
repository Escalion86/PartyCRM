import {readFile,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const access=JSON.parse(await readFile('output/demo/local-demo-access.json','utf8'))
const base='http://localhost:3000'
const testOrder='58cbc983db7c575c04829dd5'
const summary=[]
for(const who of ['sales','artDirector']){
  const login=await fetch(base+'/api/party/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(access[who])})
  assert.equal(login.status,200)
  const headers={Cookie:login.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json','x-partycrm-company-id':access.companyId}
  const api=async(path,method='GET',body,expected=200,extra={})=>{
    const r=await fetch(base+path,{method,headers:{...headers,...extra},...(body?{body:JSON.stringify(body)}:{})})
    const data=await r.json()
    assert.equal(r.status,expected,`${who} ${method} ${path}: ${JSON.stringify(data.error)}`)
    return data.data
  }
  const memberships=await api('/api/party/memberships')
  assert.equal(memberships.memberships.length,1)
  const orders=await api('/api/party/orders')
  assert(orders.length>=6)
  for(const order of orders){
    assert(!('adminComment' in order))
    assert(!(order.transactions||[]).some(t=>t.type==='income'))
    if(who==='sales')assert(!('assignedStaff' in order))
    else assert(!('contractAmount' in order))
  }
  const tasks=await api('/api/party/tasks')
  assert(tasks.tasks.some(t=>t.title.includes(who==='sales'?'Перезвонить Анне':'Проверить состав')))
  const options=await api('/api/party/order-options?orderId='+testOrder)
  if(who==='sales'){
    assert(options.clients.length>=4)
    await api('/api/party/transactions','GET',null,403)
    await api('/api/party/orders/'+testOrder,'PATCH',{assignedStaff:[{staffId:memberships.memberships[0].staff._id,role:'assistant',payoutAmount:1000}]},403)
    const current=orders.find(o=>o._id===testOrder)
    await api('/api/party/orders/'+testOrder,'PATCH',{title:current.title,contractAmount:15000})
  }else{
    const staff=options.staff.find(s=>s.role==='performer')
    assert(staff)
    await api('/api/party/orders/'+testOrder,'PATCH',{contractAmount:12345},403)
    await api('/api/party/orders/'+testOrder,'PATCH',{assignedStaff:[{staffId:staff._id,role:'performer',payoutAmount:3000,payoutStatus:'planned'}]})
    const payout={orderId:testOrder,staffId:staff._id,type:'expense',category:'payout',amount:3000,date:'2026-11-03T07:00:00Z',paymentMethod:'cash',comment:'Проверка ограниченной должности худрука; демонстрационная выплата'}
    await api('/api/party/transactions','POST',payout,201,{'Idempotency-Key':'f4e3704a-d3b4-4e52-b60e-202611030004'})
    const tx=await api('/api/party/transactions')
    assert(tx.length>=1&&tx.every(t=>t.type==='expense'&&t.category==='payout'))
  }
  await api('/api/party/transactions','POST',{orderId:testOrder,type:'income',category:'deposit',amount:1,paymentMethod:'cash'},403)
  await api('/api/party/company-settings','PATCH',{settings:{defaultTown:'Forbidden'}},403)
  const page=await fetch(base+'/company/settings',{headers,redirect:'manual'})
  assert([303,307,308].includes(page.status),'settings route must redirect')
  summary.push({who,login:true,orders:true,tasks:true,restrictedFields:true,forbiddenWritesRejected:true,settingsRedirect:true,allowedWrite:who==='sales'?'order price/title':'team and payout'})
}
await writeFile('output/demo/limited-accounts-check.json',JSON.stringify(summary,null,2))
console.log(JSON.stringify(summary,null,2))
