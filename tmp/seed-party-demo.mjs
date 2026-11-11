import nextEnv from '@next/env'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { DEFAULT_PARTY_WORKFLOW } from '../helpers/partyWorkflow.js'
import { getPartyDefaultRolePermissions } from '../helpers/partyRolePermissions.js'
import reportsSchema, { partyReportTemplatesSchema } from '../schemas/partyReportsSchema.js'

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} })
const uri = process.env.PARTYCRM_MONGODB_URI || process.env.MONGODB_URI
const dbName = process.env.PARTYCRM_MONGODB_DBNAME || process.env.MONGODB_DBNAME
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(uri).hostname) || dbName !== 'partycrm') throw new Error('Local partycrm DB required')
const key = 'partycrm-presentation-2026-11-03-v1'
const id = (name) => new mongoose.Types.ObjectId(createHash('sha256').update(key + ':' + name).digest('hex').slice(0, 24))
const tenantId = id('company')
const c = await mongoose.createConnection(uri, { dbName, serverSelectionTimeoutMS: 5000, autoIndex: false, autoCreate: false }).asPromise()
try {
  const models = {}
  for (const [collection, file] of Object.entries({ companies:'Companies', users:'Users', staff:'Staff', roles:'Roles', clients:'Clients', locations:'Locations', services:'Services', orders:'Orders', transactions:'Transactions', tasks:'Tasks' })) {
    const definition = (await import(`../schemas/party${file}Schema.js`)).default
    models[collection] = c.model('Demo_' + collection, new mongoose.Schema(definition, { timestamps:true, autoIndex:false, autoCreate:false }), collection)
  }
  models.reportTemplates = c.model('Demo_reportTemplates', new mongoose.Schema(partyReportTemplatesSchema, { timestamps:true }), 'reportTemplates')
  models.reports = c.model('Demo_reports', new mongoose.Schema(reportsSchema, { timestamps:true }), 'reports')
  await mkdir('output/demo', { recursive:true })
  const accessPath = 'output/demo/local-demo-access.json'
  let access
  try { access = JSON.parse(await readFile(accessPath, 'utf8')) } catch (e) { if(e.code !== 'ENOENT') throw e }
  if (!access) {
    access = { companyId:String(tenantId), company:'Праздник рядом — ДЕМО', owner:{phone:'70000000101',password:'Demo-' + randomBytes(9).toString('base64url')}, performer:{phone:'70000000102',password:'Demo-' + randomBytes(9).toString('base64url')} }
    await writeFile(accessPath, JSON.stringify(access,null,2), { flag:'wx' })
  }
  if(access.companyId !== String(tenantId)) throw new Error('Manifest mismatch')
  for (const who of ['owner','performer']) {
    const existing = await models.users.findOne({phone:access[who].phone}).lean()
    if(existing && String(existing._id) !== String(id(who+'User'))) throw new Error('Demo phone already belongs to another account')
  }
  const existingCompany = await models.companies.findById(tenantId).lean()
  if(existingCompany && existingCompany.settings?.demoSeedKey !== key) throw new Error('Company identity collision')
  const now = new Date()
  // Calendar date follows the user's Krasnoyarsk time zone, regardless of host TZ.
  const dateKey = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Krasnoyarsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
  const date = (offset, hour=15) => new Date(new Date(dateKey+'T00:00:00+07:00').getTime() + (offset*24+hour)*3600000)
  const docs = Object.fromEntries(Object.keys(models).map(k=>[k,[]]))
  const add = (collection, name, fields) => { const data={_id:id(name),...(collection==='users'||collection==='companies'?{}:{tenantId}),...fields}; docs[collection].push(data); return data }
  add('companies','company',{tenantId,title:access.company,status:'active',trialActivatedAt:now,trialEndsAt:date(30,23),trialUsed:true,settings:{demoSeedKey:key,timeZone:'Asia/Krasnoyarsk',orderFormVariant:'compact',defaultTown:'Красноярск',towns:['Красноярск'],workflow:DEFAULT_PARTY_WORKFLOW,notifications:{pushEnabled:false},integrations:{},publicLeadEnabled:false}})
  for (const who of ['owner','performer']) {
    add('users',who+'User',{phone:access[who].phone,password:await bcrypt.hash(access[who].password,10),firstName:who==='owner'?'Демо':'Алексей',secondName:who==='owner'?'Администратор':'Аниматор',interfaceRoles:[who==='owner'?'company':'performer'],lastWorkspace:who==='owner'?'company':'performer',performerOnboardingCompletedAt:now,performerSettings:{notifications:{pushEnabled:false}},status:'active'})
    add('roles',who+'Role',{title:who==='owner'?'Руководитель':'Исполнитель',systemKey:who,baseRole:who,permissions:getPartyDefaultRolePermissions(who),orderScope:{assignedOnly:who==='performer'}})
    add('staff',who+'Staff',{authUserId:String(id(who+'User')),linkedAuthUserId:String(id(who+'User')),firstName:who==='owner'?'Демо':'Алексей',secondName:who==='owner'?'Администратор':'Аниматор',role:who,phone:access[who].phone,positionId:id(who+'Role'),status:'active',linkStatus:'linked',linkConfirmedAt:now,specialization:who==='owner'?'':'animator'})
  }
  add('staff','secondStaff',{firstName:'Мария',secondName:'Мастер-классы',role:'performer',specialization:'workshop',status:'active',description:'Демонстрационный подрядчик без аккаунта'})
  for(const [i,title] of ['Зал 1 — Праздничный','Зал 2 — Творческая студия'].entries()) add('locations','location'+i,{title,address:{town:'Красноярск',street:'Демонстрационная',house:String(i+1),comment:'Вымышленный адрес'},capacity:20,preparationMinutes:30,cleanupMinutes:30})
  for(const [i,title,price,duration,specialization] of [[0,'Анимация: день рождения',15000,120,'animator'],[1,'Творческий мастер-класс',12000,90,'workshop'],[2,'Игровая программа',10000,60,'animator']]) add('services','service'+i,{title,price,duration,specialization,description:'Демонстрационная услуга'})
  for(const [i,name] of ['Анна','Елена','Ольга','Дмитрий'].entries()) add('clients','client'+i,{firstName:name,secondName:'Демо',email:`demo${i}@example.invalid`,comment:'Вымышленный клиент для презентации'})
  const specs=[
    ['main','День рождения Маши — показ аванса',1,15,0,0,15000,'active','discussion',0,0],
    ['deposit','День рождения Артёма — аванс внесён',2,12,0,0,15000,'active','preparation',1,5000],
    ['workshop','Мастер-класс — оплачено',1,11,1,1,12000,'active','preparation',2,12000],
    ['today','Игровая программа — сегодня',0,17,0,2,10000,'active','preparation',3,3000],
    ['past','Праздник завершён — отчёт и расчёт',-1,14,0,0,15000,'active','review',1,15000],
    ['lead','Новая заявка — уточнить пожелания',3,11,1,0,15000,'draft','new',2,0],
  ]
  for(const [name,title,day,hour,loc,svc,amount,status,stage,client,paid] of specs){
    const performer=name==='workshop'?'secondStaff':'performerStaff'
    const duration=svc===1?90:svc===2?60:120
    const order=add('orders',name,{title,status,workflowStageId:stage,clientId:id('client'+client),client:{name:docs.clients[client].firstName+' Демо',phone:'',email:docs.clients[client].email},eventDate:date(day,hour),dateEnd:new Date(date(day,hour).getTime()+duration*60000),durationMinutes:duration,locationId:id('location'+loc),servicesIds:[id('service'+svc)],serviceTitle:docs.services[svc].title,contractAmount:amount,responsibleStaffId:id('ownerStaff'),assignedStaff:[{staffId:id(performer),role:'performer',payoutAmount:3000,payoutStatus:name==='past'?'paid':'planned',confirmationStatus:name==='past'?'done':'confirmed'}],eventBrief:{occasion:'День рождения',celebrantName:name==='main'?'Маша':'Демо',celebrantAge:7,guestCount:12,guestAgeRange:'6–8 лет',wishes:'Подвижные игры, музыка, поздравление и вынос торта'},performerComment:'Приехать за 30 минут. Уточнить готовность музыки у администратора.',adminComment:'Демонстрационный заказ. Все данные вымышлены.',leadSource:'Демонстрация'})
    if(paid) add('transactions',name+'Income',{orderId:order._id,clientId:order.clientId,amount:paid,type:'income',category:paid===amount?'client_payment':'deposit',date:date(-1,10),paymentMethod:'transfer',comment:'Учебная запись, реального перевода нет'})
    if(name==='past') add('transactions','pastPayout',{orderId:order._id,clientId:order.clientId,staffId:id('performerStaff'),amount:3000,type:'expense',category:'payout',date:date(-1,18),paymentMethod:'cash',comment:'Демонстрационная выплата'})
  }
  const taskSpecs=[['Уточнить число детей','main','ownerStaff','new',0,13],['Подтвердить программу с Анной','main','performerStaff','new',0,18],['Проверить музыку и костюм','main','performerStaff','in_progress',1,10],['Согласовать вынос торта','main','ownerStaff','done',0,11],['Подготовить материалы мастер-класса','workshop','secondStaff','new',1,9],['Связаться с клиентом по новой заявке','lead','ownerStaff','new',-1,18],['Проверить порядок в зале',null,'ownerStaff','new',0,19],['Проверить поступление остатка','today','ownerStaff','in_progress',0,16]]
  taskSpecs.forEach(([title,order,staff,status,day,hour],i)=>add('tasks','task'+i,{title,orderId:order?id(order):null,assigneeStaffIds:[id(staff)],createdByStaffId:id('ownerStaff'),createdByUserId:id('ownerUser'),descriptionHtml:'<p>Демонстрационная задача. Откройте её, проверьте назначение и срок, затем измените статус.</p>',status,dueAt:date(day,hour),timeZone:'Asia/Krasnoyarsk',effectsPending:false,pendingNotifications:[],completedAt:status==='done'?date(0,11):null,completedByStaffId:status==='done'?id('ownerStaff'):null,completedByUserId:status==='done'?id('ownerUser'):null,history:[{action:'created',staffId:id('ownerStaff'),userId:id('ownerUser'),at:now,toStatus:status}]}))
  const template=add('reportTemplates','reportTemplate',{familyId:id('reportFamily'),title:'Как прошло мероприятие',stage:'after',audience:'individual',version:1,dueAnchor:'end',dueOffsetMinutes:120,fields:[{id:'result',label:'Как прошло мероприятие?',required:true,reviewerPositionId:id('ownerRole')},{id:'issues',label:'Были ли сложности?',reviewerPositionId:id('ownerRole')}]})
  add('reports','pastReport',{orderId:id('past'),staffId:id('performerStaff'),templateId:template._id,templateFamilyId:template.familyId,templateSnapshot:template,stage:'after',status:'submitted',submittedAt:date(-1,18),answers:[{fieldId:'result',html:'<p>Все 12 детей участвовали в играх. Программа завершена вовремя, клиент доволен.</p>',status:'submitted'},{fieldId:'issues',html:'<p>Сложностей не было. Музыку и реквизит проверили заранее.</p>',status:'submitted'}]})
  // Validate every document before any database mutation. Only seed-owned IDs are insertable.
  const prepared={}
  for(const [collection,rows] of Object.entries(docs)){
    prepared[collection]=[]
    for(const row of rows){const doc=new models[collection](row);await doc.validate();prepared[collection].push({...doc.toObject(),createdAt:now,updatedAt:now})}
  }
  const unrelatedCounts={}
  for(const [collection,rows] of Object.entries(prepared)) unrelatedCounts[collection]=await c.collection(collection).countDocuments({_id:{$nin:rows.map(r=>r._id)}})
  if(!process.argv.includes('--apply')){console.log(JSON.stringify({validated:true,counts:Object.fromEntries(Object.entries(prepared).map(([k,v])=>[k,v.length]))}));process.exitCode=0}
  else {
    for(const [collection,rows] of Object.entries(prepared)){
      for(const row of rows){
        const existing=await c.collection(collection).findOne({_id:row._id})
        if(existing && row.tenantId && String(existing.tenantId)!==String(tenantId))throw new Error('Cross-tenant collision')
        await c.collection(collection).updateOne({_id:row._id},{$setOnInsert:row},{upsert:true})
      }
    }
    for(const [collection,rows] of Object.entries(prepared)){
      const saved=await c.collection(collection).find({_id:{$in:rows.map(r=>r._id)}}).toArray()
      if(saved.length!==rows.length)throw new Error('Count mismatch: '+collection)
      if(await c.collection(collection).countDocuments({_id:{$nin:rows.map(r=>r._id)}})!==unrelatedCounts[collection])throw new Error('Unrelated count changed: '+collection)
      for(const row of saved) await new models[collection](row).validate()
    }
    for(const who of ['owner','performer']) { const user=await models.users.findById(id(who+'User'));if(!await bcrypt.compare(access[who].password,user.password))throw new Error('Login hash mismatch') }
    const summary={company:access.company,companyId:String(tenantId),baseDate:dateKey,counts:Object.fromEntries(Object.entries(prepared).map(([k,v])=>[k,v.length])),orders:specs.map(([name,title,day,hour,loc,svc,amount,status,stage,client,paid])=>({id:String(id(name)),title,localDate:date(day,hour).toISOString(),amount,received:paid,remaining:amount-paid}))}
    await writeFile('output/demo/local-demo-summary.json',JSON.stringify(summary,null,2))
    await writeFile('output/demo/README.md',`# Локальная демонстрационная компания\n\nКомпания: ${access.company}\n\nВход: /party/login (локальный сервер).\n\nАдминистратор: ${access.owner.phone}\nПароль: ${access.owner.password}\n\nИсполнитель: ${access.performer.phone}\nПароль: ${access.performer.password}\n\nДаты календаря: ${dateKey} и следующие 3 дня, часовой пояс Красноярска.\n\nОсновной заказ: «День рождения Маши — показ аванса» (15 000 руб., без оплат). Внесите 5 000 руб., остаток станет 10 000 руб.\n\nДля готового примера аванса: «День рождения Артёма — аванс внесён».\nДля отчёта: «Праздник завершён — отчёт и расчёт»; отчёт отправлен и ожидает проверки.\n\nЕсть 8 задач: новые, в работе, выполненная и просроченная. Есть самостоятельная задача без заказа.\n\nВсе сведения вымышлены. Внешние интеграции и push не подключены. Пароли относятся только к локальным демонстрационным аккаунтам; файл не публиковать.\n`)
    console.log(JSON.stringify(summary,null,2))
  }
} finally {await c.close()}
