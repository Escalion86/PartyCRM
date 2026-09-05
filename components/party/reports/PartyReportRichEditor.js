'use client'

import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'

export default function PartyReportRichEditor({
  value = '',
  onChange,
  onUploadingChange,
  companyId,
  reportId,
  fieldId,
  label,
  requiredMedia = false,
  disabled = false,
}) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Image.configure({ allowBase64: false }),
    ],
    content: value,
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: 'min-h-36 p-3 outline-none',
        role: 'textbox',
        'aria-label': label,
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  })
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold'),
      italic: current?.isActive('italic'),
      bulletList: current?.isActive('bulletList'),
      orderedList: current?.isActive('orderedList'),
    }),
  })
  useEffect(() => {
    // Toggling read-only during a save/upload must not look like a content edit.
    editor?.setEditable(!disabled && !uploading, false)
  }, [editor, disabled, uploading])
  const upload = async (file) => {
    if (!file || !editor) return
    setError('')
    setUploading(true)
    onUploadingChange?.(true)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('reportId', reportId)
      body.append('fieldId', fieldId)
      const response = await fetch('/api/party/report-media', {
        method: 'POST',
        headers: { 'x-partycrm-company-id': companyId },
        body,
      })
      const json = await response.json()
      if (!response.ok || !json.data?.url)
        throw new Error(
          json.error?.message || 'Не удалось загрузить фотографию'
        )
      editor
        .chain()
        .focus()
        .setImage({ src: json.data.url, alt: file.name })
        .run()
    } catch (cause) {
      setError(cause.message)
    } finally {
      setUploading(false)
      onUploadingChange?.(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  const actions = [
    ['bold', 'Жирный', () => editor.chain().focus().toggleBold().run()],
    ['italic', 'Курсив', () => editor.chain().focus().toggleItalic().run()],
    [
      'bulletList',
      '• Список',
      () => editor.chain().focus().toggleBulletList().run(),
    ],
    [
      'orderedList',
      '1. Список',
      () => editor.chain().focus().toggleOrderedList().run(),
    ],
  ]
  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
      <div
        role="toolbar"
        aria-label="Форматирование текста"
        className="flex flex-wrap gap-1 border-b border-slate-200 p-2"
      >
        {actions.map(([id, title, run]) => (
          <button
            key={id}
            type="button"
            disabled={!editor || disabled || uploading}
            aria-pressed={Boolean(active?.[id])}
            onClick={run}
            className={`min-h-10 cursor-pointer rounded px-3 text-sm disabled:opacity-50 ${active?.[id] ? 'bg-sky-100 text-sky-800' : 'bg-slate-50 text-slate-700'}`}
          >
            {title}
          </button>
        ))}
        <button
          type="button"
          disabled={!editor || disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="min-h-10 cursor-pointer rounded bg-slate-50 px-3 text-sm disabled:opacity-50"
        >
          {uploading ? 'Загрузка…' : '+ Фото'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Добавить фотографию в текст"
          className="hidden"
          onChange={(event) => upload(event.target.files?.[0])}
        />
      </div>
      <p className="px-3 pt-2 text-xs text-slate-500">
        {requiredMedia ? 'Фотография обязательна. ' : ''}
        Фото вставляются в текст ответа: JPEG, PNG или WebP до 10 МБ.
      </p>
      {error && (
        <p role="alert" className="p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="party-report-rich">
        <EditorContent editor={editor} />
      </div>
      <style jsx global>{`
        .party-report-rich p {
          margin: 0.4em 0;
        }
        .party-report-rich ul {
          list-style: disc;
          padding-left: 1.5em;
        }
        .party-report-rich ol {
          list-style: decimal;
          padding-left: 1.5em;
        }
        .party-report-rich img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 0.5em 0;
        }
        .party-report-rich blockquote {
          border-left: 3px solid #cbd5e1;
          padding-left: 1em;
        }
        .party-report-rich a {
          color: #0369a1;
          text-decoration: underline;
        }
        .party-report-rich {
          overflow-wrap: anywhere;
        }
      `}</style>
    </div>
  )
}
