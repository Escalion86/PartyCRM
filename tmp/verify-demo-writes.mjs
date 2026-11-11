import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import nextEnv from '@next/env'
import orderSchema from '../schemas/partyOrdersSchema.js'
const access=JSON.parse(await readFile('output/demo/local-demo-access.json','utf8'))
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const uri=process.env.PARTYCRM_MONGODB_URI||process.env.MONGODB_URI
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(uri).hostname))
const dbName=process.env.PARTYCRM_MONGODB_DBNAME||process.env.MONGODB_DBNAME
assert.equal(dbName,'partycrm')
const c=await mongoose.createConnection(uri,{dbName,serverSelectionTimeoutMS:10000,autoIndex:false,autoCreate:false}).asPromise()
try{
  const tenantId=new mongoose.Types.ObjectId(access.companyId)
  const staff=await c.collection('staff').findOne({tenantId,role:'owner'})
  const orderId=new mongoose.Types.ObjectId('58cbc983db7c575c04829dd5')
  const existing=await c.collection('orders').findOne({_id:orderId})
  if(existing)assert.equal(String(existing.tenantId),access.companyId)
  const Order=c.model('DemoWriteCheck',new mongoose.Schema(orderSchema,{timestamps:true}),'orders')
  const doc=new Order({_id:orderId,tenantId,title:'Проверка транзакций — аванс 5 000 ₽',status:'draft',workflowStageId:'new',contractAmount:15000,placeType:'client_address',customAddress:'Демонстрационный адрес',responsibleStaffId:staff._id,adminComment:'Создан для проверки записи оплат и задач после настройки локальной MongoDB.'})
  await doc.validate()
  await c.collection('orders').updateOne({_id:orderId},{$setOnInsert:{...doc.toObject(),createdAt:new Date(),updatedAt:new Date()}},{upsert:true})
  const base='http://localhost:3000'
  const login=await fetch(base+'/api/party/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(access.owner)})
  assert.equal(login.status,200,'login')
  const headers={Cookie:login.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json','x-partycrm-company-id':access.companyId}
  const request=async(path,method,body,extra={})=>{
    const r=await fetch(base+path,{method,headers:{...headers,...extra},...(body?{body:JSON.stringify(body)}:{})})
    const data=await r.json();assert(r.ok,`${method} ${path}: ${r.status} ${JSON.stringify(data.error)}`);assert(data.success);return data.data
  }
  const taskBody={draftKey:'f4e3704a-d3b4-4e52-b60e-202611030001',title:'Проверка: задачи сохраняются',descriptionHtml:'<p>Задача создана через API после включения транзакций MongoDB.</p>',orderId:String(orderId),assigneeStaffIds:[String(staff._id)],status:'new',dueAt:'2026-11-03T16:00:00.000Z',recurrence:{frequency:'none',interval:1}}
  const task=await request('/api/party/tasks','POST',taskBody)
  const paymentBody={orderId:String(orderId),amount:5000,type:'income',category:'deposit',date:'2026-11-03T06:00:00.000Z',paymentMethod:'transfer',comment:'Демонстрационная проверка, реального перевода денег нет'}
  const payment=await request('/api/party/transactions','POST',paymentBody,{'Idempotency-Key':'f4e3704a-d3b4-4e52-b60e-202611030002'})
  const repeated=await request('/api/party/transactions','POST',paymentBody,{'Idempotency-Key':'f4e3704a-d3b4-4e52-b60e-202611030002'})
  assert.equal(payment._id,repeated._id,'payment replay')
  const saved=await request('/api/party/transactions?orderId='+orderId,'GET')
  assert.equal(saved.length,1);assert.equal(saved[0].amount,5000)
  const tasks=await c.collection('tasks').find({tenantId,orderId}).toArray()
  assert.equal(tasks.length,1)
  const result={taskCreated:true,paymentCreated:true,paymentReplayDoesNotDuplicate:true,amount:15000,received:5000,remaining:10000,orderId:String(orderId),taskId:String(tasks[0]._id)}
  await writeFile('output/demo/write-check.json',JSON.stringify(result,null,2))
  console.log(JSON.stringify(result,null,2))
}finally{await c.close()}
