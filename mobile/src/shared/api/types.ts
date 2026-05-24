export type ApiErrorType =
  | 'validation'
  | 'auth'
  | 'rate_limit'
  | 'not_found'
  | 'unknown'

export type ApiErrorShape = {
  success: false
  error: {
    code?: string
    type?: ApiErrorType
    message: string
    field?: string
  }
}

export type ApiSuccessShape<TData> = {
  success: true
  data: TData
}
