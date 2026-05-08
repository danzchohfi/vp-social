"use client"
/**
 * TipTap-based rich-text editor for production scripts AND briefs.
 *
 * Two modes:
 *   - editable=true: agency edits the script (production detail page) or
 *     client fills the brief (/c/[token] modal). Toolbar shows.
 *   - editable=false: read-only render for the /approve/[token] approval
 *     page. Toolbar hidden.
 *
 * Storage format: TipTap's getJSON() — same shape as ProseMirror's JSON,
 * portable across React/Vue/server-render. Stored in
 * production.brief_json / .script_json as text.
 *
 * Auto-save: parent controls when. We expose onUpdate(json) which fires
 * on every keystroke; parent debounces via React state + setTimeout.
 */

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Link from "@tiptap/extension-link"
import { useEffect } from "react"
import { Bold, Italic, List, ListOrdered, Heading2, Heading3, Link as LinkIcon, Quote } from "lucide-react"
import { cn } from "@/lib/utils"

type EditorJson = Record<string, unknown> | null

export type ScriptEditorProps = {
  initialJson: EditorJson | string | null
  onUpdate?: (json: EditorJson) => void
  editable?: boolean
  placeholder?: string
  className?: string
}

function parseJson(input: EditorJson | string | null): EditorJson {
  if (!input) return null
  if (typeof input === "string") {
    try {
      return JSON.parse(input)
    } catch {
      // Not valid JSON — treat as plain text and let TipTap render it.
      return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: input }] }] }
    }
  }
  return input
}

export function ScriptEditor({
  initialJson,
  onUpdate,
  editable = true,
  placeholder = "Comece a escrever…",
  className,
}: ScriptEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: !editable,
        HTMLAttributes: { class: "text-primary underline underline-offset-2" },
      }),
    ],
    content: parseJson(initialJson),
    editable,
    immediatelyRender: false, // SSR-safe — avoids hydration mismatch.
    onUpdate: ({ editor }) => {
      if (onUpdate) onUpdate(editor.getJSON())
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-neutral dark:prose-invert max-w-none focus:outline-none",
          "min-h-[200px] px-4 py-3",
          editable && "min-h-[400px]",
        ),
      },
    },
  })

  // Re-sync content when the parent updates initialJson (e.g., after a
  // PATCH refresh). Without this, the editor stays stuck on the first
  // value mounted with — typing then reload would silently revert.
  useEffect(() => {
    if (!editor || !initialJson) return
    const next = parseJson(initialJson)
    if (!next) return
    const current = editor.getJSON()
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      editor.commands.setContent(next, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJson, editor])

  if (!editor) {
    return <div className={cn("min-h-[200px] rounded-md border bg-muted/20", className)} />
  }

  return (
    <div className={cn("rounded-md border bg-card", className)}>
      {editable && (
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-2 py-1.5">
          <ToolbarButton
            isActive={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Negrito (Ctrl+B)"
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Itálico (Ctrl+I)"
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            isActive={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Título 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Título 3"
          >
            <Heading3 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            isActive={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Lista"
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Lista numerada"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            isActive={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Citação"
          >
            <Quote className="h-3.5 w-3.5" />
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            isActive={editor.isActive("link")}
            onClick={() => {
              const url = window.prompt(
                "URL do link (deixe vazio pra remover):",
                editor.getAttributes("link").href ?? "",
              )
              if (url === null) return
              if (url === "") {
                editor.chain().focus().unsetLink().run()
                return
              }
              editor.chain().focus().setLink({ href: url, target: "_blank" }).run()
            }}
            title="Link"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}

function ToolbarButton({
  isActive,
  onClick,
  title,
  children,
}: {
  isActive: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        isActive && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="h-5 w-px bg-border" />
}
