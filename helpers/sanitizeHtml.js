import createDOMPurify from 'dompurify'

let domPurifyInstance = null

const sanitizeHtml = (value) => {
  const source = typeof value === 'string' ? value : ''
  if (typeof window === 'undefined') return source
  if (!domPurifyInstance) domPurifyInstance = createDOMPurify(window)
  return domPurifyInstance.sanitize(source)
}

export default sanitizeHtml
