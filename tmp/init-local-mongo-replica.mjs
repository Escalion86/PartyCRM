import mongoose from 'mongoose'
const { MongoClient } = mongoose.mongo
import { writeFile } from 'node:fs/promises'
const client=new MongoClient('mongodb://127.0.0.1:27017/?directConnection=true',{serverSelectionTimeoutMS:5000})
await client.connect()
try {
  const admin=client.db('admin')
  let hello=await admin.command({hello:1})
  if(!hello.setName){
    await admin.command({replSetInitiate:{_id:'localrs',members:[{_id:0,host:'localhost:27017'}]}})
  }else if(hello.setName!=='localrs')throw new Error('Unexpected replica set')
  for(let i=0;i<30;i++){
    hello=await admin.command({hello:1})
    if(hello.isWritablePrimary && hello.setName==='localrs')break
    await new Promise(resolve=>setTimeout(resolve,1000))
  }
  if(!hello.isWritablePrimary)throw new Error('Primary election timed out')
  const session=client.startSession()
  try { await session.withTransaction(async()=>{await client.db('partycrm').collection('companies').findOne({_id:{$exists:true}},{session,projection:{_id:1}})}) }
  finally {await session.endSession()}
  const result={replicaSet:hello.setName,primary:hello.primary,transactionReadPassed:true}
  await writeFile('output/demo/mongodb-check.json',JSON.stringify(result,null,2))
  console.log(JSON.stringify(result))
} finally {await client.close()}
