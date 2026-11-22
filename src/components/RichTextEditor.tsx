"use client";

import { useEffect, useRef } from "react";

interface Props {
  value: string; // HTML
  onChange: (html: string) => void;
  placeholder?: string;
}

// Lightweight WYSIWYG built on contentEditable — no dependencies.
// Outputs an HTML string; callers should also derive a plain-text version.
export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Reflect external value changes (e.g. template insertion)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    ref.current?.focus();
    onChange(ref.current?.innerHTML ?? "");
  };

  const addLink = () => {
    const url = window.prompt("Link URL (https://…)");
    if (url) exec("createLink", url);
  };

  const btn =
    "px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded border border-transparent hover:border-slate-200";

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
      <div className="flex items-center gap-0.5 px-2 py-1 bg-slate-50 border-b border-slate-200">
        <button type="button" className={btn} title="Bold" onClick={() => exec("bold")}>
          <b>B</b>
        </button>
        <button type="button" className={btn} title="Italic" onClick={() => exec("italic")}>
          <i>I</i>
        </button>
        <button type="button" className={btn} title="Underline" onClick={() => exec("underline")}>
          <u>U</u>
        </button>
        <span className="w-px h-4 bg-slate-300 mx-1" />
        <button type="button" className={btn} title="Bullet list" onClick={() => exec("insertUnorderedList")}>
          • List
        </button>
        <button type="button" className={btn} title="Numbered list" onClick={() => exec("insertOrderedList")}>
          1. List
        </button>
        <span className="w-px h-4 bg-slate-300 mx-1" />
        <button type="button" className={btn} title="Insert link" onClick={addLink}>
          🔗 Link
        </button>
        <button
          type="button"
          className={btn}
          title="Clear formatting"
          onClick={() => {
            if (ref.current) ref.current.innerHTML = "";
            onChange("");
          }}
        >
          ✕
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="min-h-[120px] px-3 py-2 text-sm outline-none [&:empty:before]:content-[attr(data-placeholder)] [&:empty:before]:text-slate-400"
      />
    </div>
  );
}
