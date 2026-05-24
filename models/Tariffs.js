import mongoose from 'mongoose'
import tariffsSchema from '@schemas/tariffsSchema'

const TariffsSchema = new mongoose.Schema(tariffsSchema, { timestamps: true })

export default mongoose.models.Tariffs ||
  mongoose.model('Tariffs', TariffsSchema)
