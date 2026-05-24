var mongoose = require('mongoose')
const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
  )
}

let cached = global.mongoose

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null }
}

async function dbConnect() {
  if (cached.conn) {
    console.log('dbConnect: используется текущее соединение')
    return cached.conn
  }

  if (!cached.promise) {
    console.log('dbConnect: соединяем')
    const opts = {
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      // bufferCommands: false,
      // useFindAndModify: false,
      dbName: process.env.MONGODB_DBNAME,
    }

    const db = mongoose.connection
    db.on('error', console.error.bind(console, 'connection error: '))
    db.once('open', function () {
      console.log('Connected successfully')
    })

    mongoose.set('strictQuery', false)
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose
    })
  } else {
    console.log('dbConnect: ожидаем соединения (повторно)')
  }
  cached.conn = await cached.promise
  return cached
}

export default dbConnect
