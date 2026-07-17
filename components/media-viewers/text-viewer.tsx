"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, WrapText, AlignLeft, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/system/spinner";

interface TextViewerProps {
  src: string;
  fileName: string;
  mimeType: string;
}

const MAX_PREVIEW_SIZE = 500_000;
const TRUNCATION_WARN_SIZE = 100_000;

const LANG_MAP: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
  kt: "kotlin", swift: "swift", c: "c", cpp: "cpp", h: "c", hpp: "cpp",
  cs: "csharp", php: "php",
  html: "html", htm: "html", css: "css", scss: "scss", less: "less", sass: "sass",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", svg: "svg",
  sql: "sql", sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
  ps1: "powershell", bat: "batch",
  md: "markdown", mdx: "markdown",
  vue: "vue", svelte: "svelte", astro: "astro",
  txt: "text", log: "text", env: "text", ini: "text", cfg: "text", conf: "text",
  gitignore: "text", dockerignore: "text", makefile: "text", dockerfile: "text",
};

function getLanguage(ext: string): string {
  return LANG_MAP[ext] || "text";
}

const HIGHLIGHTERS: Record<string, (line: string) => string> = {
  json(line: string): string {
    return line
      .replace(/"([^"\\]|\\.)*"\s*:/g, (m) => `<span class="text-violet-400">${m.slice(0, -1)}</span>:`)
      .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span class="text-emerald-400">$1</span>')
      .replace(/:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g, ': <span class="text-amber-400">$1</span>')
      .replace(/:\s*(true|false|null)/g, ': <span class="text-cyan-400">$1</span>');
  },
  markdown(line: string): string {
    const header = line.match(/^(#{1,6})\s+(.+)$/);
    if (header) return `<span class="text-violet-400 font-bold">${header[1]}</span> <span class="font-semibold">${escapeHtml(header[2])}</span>`;
    const list = line.match(/^(\s*[-*+]\s)(.+)$/);
    if (list) return `<span class="text-accent">${escapeHtml(list[1])}</span>${escapeHtml(list[2])}`;
    const code = line.match(/^(`{3,})/);
    if (code) return `<span class="text-emerald-400">${escapeHtml(line)}</span>`;
    const link = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (link) return line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="text-blue-400 underline">$1</span>');
    const bold = line.match(/\*\*(.+?)\*\*/);
    if (bold) return line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const inlineCode = line.match(/`(.+?)`/);
    if (inlineCode) return line.replace(/`(.+?)`/g, '<code class="bg-accent/10 px-1 rounded text-emerald-400">$1</code>');
    return escapeHtml(line);
  },
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const KEYWORD_SETS: Record<string, { keywords: string; types: string; decorators?: string; builtins?: string }> = {
  javascript: {
    keywords: "\\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|this|typeof|instanceof|void|delete|in|of|class|extends|super|import|export|default|from|as|async|await|yield|static|get|set|true|false|null|undefined|NaN|Infinity)\\b",
    types: "\\b(string|number|boolean|any|void|never|null|undefined|object|symbol|bigint|Array|Promise|Map|Set|WeakMap|WeakSet|Error|Date|RegExp|Function|Record|Partial|Required|Readonly|Pick|Omit|Exclude|Extract|NonNullable|ReturnType|InstanceType)\\b",
  },
  typescript: {
    keywords: "\\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|this|typeof|instanceof|void|delete|in|of|class|extends|super|import|export|default|from|as|async|await|yield|static|get|set|true|false|null|undefined|NaN|Infinity|interface|type|enum|namespace|module|declare|abstract|readonly|private|protected|public|implements|satisfies)\\b",
    types: "\\b(string|number|boolean|any|void|never|null|undefined|object|symbol|bigint|Array|Promise|Map|Set|WeakMap|WeakSet|Error|Date|RegExp|Function|Record|Partial|Required|Readonly|Pick|Omit|Exclude|Extract|NonNullable|ReturnType|InstanceType|Parameters|ConstructorParameters|Awaited)\\b",
    decorators: "@\\w+",
  },
  python: {
    keywords: "\\b(def|class|return|if|elif|else|for|while|try|except|finally|raise|import|from|as|with|pass|break|continue|yield|lambda|async|await|True|False|None|and|or|not|is|in|del|global|nonlocal|assert|self|cls|print|len|range|map|filter|zip|enumerate|sorted|reversed|super|property|staticmethod|classmethod)\\b",
    types: "\\b(int|float|str|bool|list|dict|tuple|set|frozenset|bytes|bytearray|NoneType|Any|Optional|Union|List|Dict|Tuple|Set|Callable|Iterable|Iterator|Generator|TypeVar)\\b",
    decorators: "@\\w+(?:\\.\\w+)?",
    builtins: "\\b(__init__|__str__|__repr__|__len__|__getitem__|__setitem__|__call__|__enter__|__exit__|__aenter__|__aexit__|__aiter__|__anext__|__await__)\\b",
  },
  go: {
    keywords: "\\b(func|return|if|else|for|range|switch|case|default|break|continue|go|defer|select|chan|struct|interface|map|type|package|import|var|const|true|false|nil|fallthrough|goto|iota|append|len|cap|make|new|close|delete|panic|recover|error|string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|complex64|complex128|byte|rune|bool)\\b",
    types: "\\b(error|string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|complex64|complex128|byte|rune|bool|any|comparable)\\b",
  },
  rust: {
    keywords: "\\b(fn|let|mut|const|static|return|if|else|for|while|loop|match|break|continue|struct|enum|impl|trait|pub|use|mod|crate|self|super|where|as|in|ref|move|async|await|unsafe|true|false|Some|None|Ok|Err|macro_rules|type|dyn|impl|union|extern|abstract|become|box|do|final|macro|override|priv|typeof|unsized|virtual|yield)\\b",
    types: "\\b(i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|bool|char|str|String|Vec|HashMap|HashSet|Box|Option|Result|Arc|Rc|Mutex|RwLock|Cell|RefCell|Cow|Deref)\\b",
  },
  java: {
    keywords: "\\b(class|interface|enum|extends|implements|public|private|protected|static|final|abstract|synchronized|volatile|transient|native|strictfp|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|throws|new|this|super|import|package|true|false|null|void|var|record|sealed|permits|non-sealed|yield|assert|default|instanceof)\\b",
    types: "\\b(String|Integer|Long|Double|Float|Boolean|Byte|Short|Character|Object|Class|List|ArrayList|Map|HashMap|Set|HashSet|Collection|Iterator|Optional|Stream|Runnable|Callable|Thread|Exception|RuntimeException|Error|Throwable)\\b",
    decorators: "@\\w+",
  },
  html: {
    keywords: "",
    types: "",
  },
  css: {
    keywords: "",
    types: "",
  },
};

function genericHighlight(line: string, lang: string): string {
  let result = escapeHtml(line);

  const langConfig = KEYWORD_SETS[lang];

  if (langConfig && lang !== "text") {
    // Decorators (@ annotations)
    if (langConfig.decorators) {
      const decoratorRe = new RegExp(langConfig.decorators, "g");
      result = result.replace(decoratorRe, '<span class="text-amber-400">$&</span>');
    }

    // Builtins (__dunder__ methods in Python, etc.)
    if (langConfig.builtins) {
      const builtinRe = new RegExp(langConfig.builtins, "g");
      result = result.replace(builtinRe, '<span class="text-cyan-400">$&</span>');
    }
  }

  if (lang !== "text") {
    // Comments (line comments: // and #)
    const lineCommentRe = /(\/\/.*$|#.*$)/gm;
    result = result.replace(lineCommentRe, '<span class="text-muted-foreground/50 italic">$1</span>');

    // Strings (single, double, backtick)
    const stringRe = /(["'`])(?:(?!\1|\\).|\\.)*\1/g;
    result = result.replace(stringRe, '<span class="text-emerald-400">$&</span>');

    // Numbers
    const numberRe = /\b(\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g;
    result = result.replace(numberRe, '<span class="text-amber-400">$1</span>');
  }

  if (langConfig) {
    // Keywords
    if (langConfig.keywords) {
      const kwRe = new RegExp(langConfig.keywords, "g");
      result = result.replace(kwRe, '<span class="text-violet-400 font-medium">$1</span>');
    }
    // Types
    if (langConfig.types) {
      const typeRe = new RegExp(langConfig.types, "g");
      result = result.replace(typeRe, '<span class="text-cyan-400">$1</span>');
    }
  }

  return result;
}

function highlightLine(line: string, language: string): string {
  if (language === "json") return HIGHLIGHTERS.json(line);
  if (language === "markdown") return HIGHLIGHTERS.markdown(line);
  return genericHighlight(line, language);
}

function countLeadingSpaces(line: string): number {
  return line.search(/\S/);
}

export function TextViewer({ src, fileName, mimeType }: TextViewerProps) {
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [totalSize, setTotalSize] = useState(0);

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const language = getLanguage(ext);

  useEffect(() => {
    let cancelled = false;
    fetch(src, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        const contentLen = r.headers.get("content-length");
        const total = contentLen ? parseInt(contentLen) : 0;
        if (!cancelled) setTotalSize(total);
        return r.text();
      })
      .then((text) => {
        if (!cancelled) {
          if (!rawContent) setTotalSize(text.length);
          if (text.length > MAX_PREVIEW_SIZE) {
            setRawContent(text.slice(0, MAX_PREVIEW_SIZE));
          } else {
            setRawContent(text);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load file content");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  const isTruncated = totalSize > MAX_PREVIEW_SIZE;
  const isLarge = totalSize > TRUNCATION_WARN_SIZE;

  const lines = useMemo(() => rawContent?.split("\n") ?? [], [rawContent]);
  const lineCount = lines.length;

  async function handleCopy() {
    if (!rawContent) return;
    await navigator.clipboard.writeText(rawContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="md" />
          <p className="text-xs text-muted-foreground">Loading file content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20 shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <span className="rounded bg-accent/10 px-2 py-0.5 font-medium text-accent shrink-0">{language}</span>
          {lineCount > 0 && (
            <span className="shrink-0">{lineCount} lines</span>
          )}
          {rawContent && (
            <span className="shrink-0">{(rawContent.length / 1024).toFixed(1)} KB</span>
          )}
          {isTruncated && (
            <span className="flex items-center gap-1 text-amber-500 shrink-0">
              <AlertTriangle className="h-3 w-3" />
              truncated
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWordWrap(!wordWrap)} title={wordWrap ? "Disable wrap" : "Enable wrap"}>
            {wordWrap ? <WrapText className="h-3.5 w-3.5" /> : <AlignLeft className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Large file warning */}
      {isLarge && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-500/5 border-b border-amber-500/10 text-xs text-amber-500/80">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>
            {isTruncated
              ? `File is ${(totalSize / 1024).toFixed(0)} KB. Showing first ${(MAX_PREVIEW_SIZE / 1024).toFixed(0)} KB.`
              : `File is ${(totalSize / 1024).toFixed(0)} KB.`}
          </span>
        </div>
      )}

      {/* Code */}
      <div className="flex-1 overflow-auto">
        <div className={cn("font-mono text-[13px] leading-relaxed", wordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre")}>
          {lines.map((line, i) => (
            <div key={i} className="flex hover:bg-accent/5 group">
              <span className={cn(
                "inline-block w-12 shrink-0 text-right pr-4 text-muted-foreground/40 select-none text-[11px] leading-relaxed",
                "group-hover:text-muted-foreground/60"
              )}>
                {i + 1}
              </span>
              <span
                className="flex-1 px-4"
                dangerouslySetInnerHTML={{ __html: highlightLine(line, language) || "&nbsp;" }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
