import test from 'node:test'
import assert from 'node:assert/strict'
import {
  countPhoneDigitsBefore,
  editPhoneDigits,
  formatPhoneLocalDigits,
  formatPhoneNumber,
  getPhoneLocalDigits,
  normalizePhoneNumber,
  phoneCaretAfterDigits,
  phoneLocalDigitsToValue,
  phoneNumbersFromText,
} from './phoneInput.js'

test('complete phone normalization removes only the 11-digit country/trunk prefix', () => {
  for (const value of [
    '89138370020',
    '79138370020',
    '+7 (913) 837-00-20',
    '9138370020',
  ]) {
    assert.equal(normalizePhoneNumber(value), '79138370020')
    assert.equal(formatPhoneNumber(value), '+7 (913) 837-00-20')
  }
  assert.equal(normalizePhoneNumber('81234567890'), '71234567890')
  assert.equal(normalizePhoneNumber('8123456789'), '78123456789')
  assert.equal(normalizePhoneNumber('7123456789'), '77123456789')
})

test('incomplete, foreign and oversized clipboard values are never shortened to a valid phone', () => {
  for (const value of [
    '',
    null,
    '123',
    '+7 (913) 837-00-2',
    '19138370020',
    '+8 913 837 00 20',
    '+1 913 837 00 20',
    '791383700201',
    'Иван 79138370020',
  ])
    assert.equal(normalizePhoneNumber(value), null)
})

test('formatting preserves national digits including a leading 7 or 8 while typing', () => {
  assert.equal(formatPhoneLocalDigits('8'), '(8')
  assert.equal(formatPhoneLocalDigits('713'), '(713)')
  assert.equal(formatPhoneLocalDigits('8134567890'), '(813) 456-78-90')
  assert.equal(getPhoneLocalDigits('+7 (813) 456-78-90'), '8134567890')
  assert.equal(getPhoneLocalDigits(79138370020), '9138370020')
  assert.equal(phoneLocalDigitsToValue('8'), 78)
  assert.equal(phoneLocalDigitsToValue(''), null)
})

test('extracts distinct phones from ordinary copied text without joining adjacent numbers', () => {
  const text =
    'Мама: 8 (913) 837-00-20\nПапа: +7 (999) 123-45-67; снова 9138370020'
  assert.deepEqual(phoneNumbersFromText(text), ['79138370020', '79991234567'])
  assert.deepEqual(phoneNumbersFromText('8 913 837 00 20 / 8 999 123 45 67'), [
    '79138370020',
    '79991234567',
  ])
  assert.deepEqual(phoneNumbersFromText('Телефон 81234567890'), ['71234567890'])
})

test('does not extract suffixes from longer numbers, foreign prefixes, identifiers or dates', () => {
  for (const text of [
    '+8 913 837-00-20',
    '+1 9138370020',
    '+44 9138370020',
    '179138370020',
    'заказ79138370020',
    '2026-10-27 12:30',
    '1234',
    '',
  ])
    assert.deepEqual(phoneNumbersFromText(text), [], text)
})

test('clipboard phone extraction supports city code groupings and Unicode separators', () => {
  assert.deepEqual(phoneNumbersFromText('8 (3912) 12-34-56'), ['73912123456'])
  assert.deepEqual(phoneNumbersFromText('+7\u00a0(39123)\u202f4–56–78'), [
    '73912345678',
  ])
})

test('Backspace removes the preceding digit next to mask punctuation', () => {
  const next = editPhoneDigits({
    digits: '9138370020',
    selectionStart: 6,
    inputType: 'deleteContentBackward',
  })
  assert.equal(next.digits, '918370020')
  assert.equal(next.caret, 3)
  assert.equal(formatPhoneLocalDigits(next.digits), '(918) 370-02-0')
})

test('Delete removes the next digit and keeps the caret in the middle', () => {
  const next = editPhoneDigits({
    digits: '9138370020',
    selectionStart: 5,
    inputType: 'deleteContentForward',
  })
  assert.equal(next.digits, '913370020')
  assert.equal(
    countPhoneDigitsBefore(formatPhoneLocalDigits(next.digits), next.caret),
    3
  )
})

test('selected middle digits can be removed or replaced without losing surrounding digits', () => {
  const selected = { digits: '9138370020', selectionStart: 6, selectionEnd: 9 }
  const deleted = editPhoneDigits({
    ...selected,
    inputType: 'deleteContentBackward',
  })
  assert.equal(deleted.digits, '9130020')
  const replaced = editPhoneDigits({ ...selected, text: '456' })
  assert.equal(replaced.digits, '9134560020')
  assert.equal(
    countPhoneDigitsBefore(
      formatPhoneLocalDigits(replaced.digits),
      replaced.caret
    ),
    6
  )
})

test('selection of all digits clears the phone; deleting at either boundary is safe', () => {
  assert.equal(
    editPhoneDigits({
      digits: '9138370020',
      selectionStart: 0,
      selectionEnd: 16,
      inputType: 'deleteContentBackward',
    }).digits,
    ''
  )
  assert.equal(
    editPhoneDigits({
      digits: '913',
      selectionStart: 0,
      inputType: 'deleteContentBackward',
    }).digits,
    '913'
  )
  assert.equal(
    editPhoneDigits({
      digits: '913',
      selectionStart: 5,
      inputType: 'deleteContentForward',
    }).digits,
    '913'
  )
})

test('typing into a full phone does not drop its last digit', () => {
  const next = editPhoneDigits({
    digits: '8138370020',
    selectionStart: 7,
    text: '9',
  })
  assert.equal(next.digits, '8138370020')
})

test('inserting partial digits into the middle preserves the suffix and digit-based caret', () => {
  const next = editPhoneDigits({
    digits: '9130020',
    selectionStart: 5,
    text: '837',
  })
  assert.equal(next.digits, '9138370020')
  assert.equal(
    phoneCaretAfterDigits(formatPhoneLocalDigits(next.digits), 6),
    next.caret
  )
})
