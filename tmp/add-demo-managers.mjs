import mongoose from 'mongoose'
import nextEnv from '@next/env'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import userSchema from '../schemas/partyUsersSchema.js'
import staffSchema from '../schemas/partyStaffSchema.js'
import roleSchema from '../schemas/partyRolesSchema.js'
import taskSchema from '../schemas/partyTasksSchema.js'
import { PARTY_ROLE_PERMISSIONS, canPartyAccess, isPartyRestrictedManagementContext } from '../helpers/partyRolePermissions.js'

nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const uri=process.env.PARTYCRM_MONGODB_URI||process.env.MONGODB_URI
const dbName=process.env.PARTYCRM_MONGODB_DBNAME||process.env.MONGODB_DBNAME
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(uri).hostname)||dbName!=='partycrm')throw new Error('Local partycrm required')
const accessPath='output/demo/local-demo-access.json'
const access=JSON.parse(await readFile(accessPath,'utf8'))
const tenantId=new mongoose.Types.ObjectId(access.companyId)
const id=name=>new mongoose.Types.ObjectId(createHash('sha256').update('demo-managers-2026-11-03:'+name).digest('hex').slice(0,24))
const permissions=(read,edit)=>({...Object.fromEntries(PARTY_ROLE_PERMISSIONS.map(({key})=>[key,'hidden'])),...Object.fromEntries(read.map(key=>[key,'read'])),...Object.fromEntries(edit.map(key=>[key,'edit']))})
const commonRead=['orders','orders.title','orders.status','orders.workflowStageId','orders.eventDate','orders.dateEnd','orders.durationMinutes','orders.placeType','orders.locationId','orders.customAddress','orders.clientAddress','orders.servicesIds','orders.serviceTitle','orders.eventBrief','orders.clientId','orders.client.name','orders.client.phone','orders.client.email','orders.responsibleStaffId','orders.performerComment','locations','services','tasks']
const commonTasks=['tasks.create','tasks.edit','tasks.assign','tasks.complete','tasks.cancel']
const profiles=[
  {key:'sales',phone:'70000000103',name:'Елена',surname:'Менеджер',title:'Менеджер по звонкам',description:'Клиенты и заявки в рабочем редакторе, бриф, стоимость, календарь, задачи перезвона. Без платежей, команды, гонораров и настроек.',permissions:permissions(commonRead,['orders.create','orders.transition','orders.title','orders.workflowStageId','orders.eventDate','orders.dateEnd','orders.durationMinutes','orders.placeType','orders.locationId','orders.customAddress','orders.clientAddress','orders.servicesIds','orders.serviceTitle','orders.eventBrief','orders.clientId','orders.client.name','orders.client.phone','orders.client.email','orders.contactRoles','orders.otherContacts','orders.leadSource','finance.clientAmount','clients','clients.create',...commonTasks]),task:'Перезвонить Анне и уточнить число детей',orderId:'a634af36ef373d27f8acc2ee'},
  {key:'artDirector',phone:'70000000104',name:'Игорь',surname:'Худрук',title:'Художественный руководитель',description:'Команда заказа, гонорары и выплаты исполнителям, расписание, задачи подготовки. Без стоимости для клиента, его оплат, расходов, маржи и настроек.',permissions:permissions([...commonRead,'orders.preparation','staff','staff.phone','reports','reports.general','reports.creative'],['orders.assignedStaff','orders.performerComment','finance.payouts',...commonTasks]),task:'Проверить состав и гонорары на праздник Маши',orderId:'a634af36ef373d27f8acc2ee'},
]
for(const profile of profiles){if(!access[profile.key])access[profile.key]={phone:profile.phone,password:'Demo-'+randomBytes(9).toString('base64url')};if(access[profile.key].phone!==profile.phone)throw new Error('Credential identity mismatch')}
// Persist generated credentials before database writes, allowing safe retries.
await writeFile(accessPath,JSON.stringify(access,null,2))
const c=await mongoose.createConnection(uri,{dbName,autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000}).asPromise()
try{
  const company=await c.collection('companies').findOne({_id:tenantId,'settings.demoSeedKey':'partycrm-presentation-2026-11-03-v1'})
  if(!company)throw new Error('Demo company identity mismatch')
  const definitions={users:userSchema,staff:staffSchema,roles:roleSchema,tasks:taskSchema}
  const models=Object.fromEntries(Object.entries(definitions).map(([name,schema])=>[name,c.model('DemoManager_'+name,new mongoose.Schema(schema,{timestamps:true,autoIndex:false,autoCreate:false}),name)]))
  const docs=[]
  const now=new Date()
  for(const p of profiles){
    const user={_id:id(p.key+'User'),phone:p.phone,password:await bcrypt.hash(access[p.key].password,10),firstName:p.name,secondName:p.surname,role:'user',interfaceRoles:['performer'],lastWorkspace:'performer',performerOnboardingCompletedAt:now,status:'active',performerSettings:{notifications:{pushEnabled:false}}}
    const role={_id:id(p.key+'Role'),tenantId,title:p.title,description:p.description,baseRole:'admin',permissions:p.permissions,orderScope:{assignedOnly:false,includeUnlocated:true},active:true}
    const staff={_id:id(p.key+'Staff'),tenantId,authUserId:String(user._id),linkedAuthUserId:String(user._id),firstName:p.name,secondName:p.surname,phone:p.phone,role:'admin',positionId:role._id,status:'active',linkStatus:'linked',linkConfirmedAt:now,description:p.description}
    const context={tenantId,staff,role:'admin',position:role,company}
    if(!isPartyRestrictedManagementContext(context))throw new Error('Expected limited role')
    for(const resource of ['finance.payments','finance.expenses','finance.margin','roles.manage'])if(canPartyAccess(context,{resource,action:'edit'}))throw new Error('Excess privilege: '+resource)
    if(canPartyAccess(context,{resource:'finance.payouts',action:'edit'})!==(p.key==='artDirector'))throw new Error('Payout permissions')
    const task={_id:id(p.key+'Task'),tenantId,title:p.task,descriptionHtml:'<p>Демонстрационная задача для сотрудника с ограниченной должностью.</p>',orderId:new mongoose.Types.ObjectId(p.orderId),assigneeStaffIds:[staff._id],createdByStaffId:staff._id,createdByUserId:user._id,status:'new',dueAt:new Date('2026-11-03T13:00:00Z'),timeZone:'Asia/Krasnoyarsk',effectsPending:false}
    const collision=await c.collection('users').findOne({phone:p.phone})
    if(collision&&String(collision._id)!==String(user._id))throw new Error('Phone collision')
    for(const [collection,row] of [['users',user],['roles',role],['staff',staff],['tasks',task]]){
      const existing=await c.collection(collection).findOne({_id:row._id})
      if(existing&&row.tenantId&&String(existing.tenantId)!==access.companyId)throw new Error('Tenant collision')
      const doc=new models[collection](row);await doc.validate();docs.push({collection,data:{...doc.toObject(),createdAt:now,updatedAt:now}})
    }
  }
  const session=await c.startSession()
  try{await session.withTransaction(async()=>{for(const {collection,data} of docs)await c.collection(collection).updateOne({_id:data._id},{$setOnInsert:data},{upsert:true,session})})}finally{await session.endSession()}
  for(const p of profiles){const saved=await c.collection('users').findOne({_id:id(p.key+'User')});if(!await bcrypt.compare(access[p.key].password,saved.password))throw new Error('Credential mismatch')}
  const notes=profiles.map(p=>`## ${p.title}\n\nТелефон: ${p.phone}\nПароль: ${access[p.key].password}\n\n${p.description}\n`).join('\n')
  await writeFile('output/demo/limited-accounts.md',`# Ограниченные аккаунты демокомпании\n\nВход: http://localhost:3000/party/login\nРабочий кабинет после входа: http://localhost:3000/performer/work\nКомпания: ${access.company}\n\n${notes}\nКлиенты доступны в редакторе заказа. Журнал телефонии не подключён.\n`)
  console.log(JSON.stringify({company:access.company,created:profiles.map(p=>({name:p.title,phone:p.phone,staffId:String(id(p.key+'Staff'))})),validated:true}))
}finally{await c.close()}
