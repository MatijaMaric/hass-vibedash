import type { BaseComponentProps } from "@json-render/react";

interface HAMarkdownProps {
  title: string;
  content: string;
}

/**
 * Simple markdown renderer. Handles headings, bold, italic, code,
 * lists, and line breaks. No external dependency.
 */
function renderMarkdown(md: string): string {
  let html = escapeHtml(md);

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h4 class="mt-3 mb-1 text-sm font-semibold text-foreground">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="mt-3 mb-1 text-base font-semibold text-foreground">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="mt-3 mb-1 text-lg font-bold text-foreground">$1</h2>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-muted px-1 py-0.5 text-xs font-mono">$1</code>',
  );

  // Unordered lists
  html = html.replace(
    /^[*-] (.+)$/gm,
    '<li class="ml-4 list-disc text-sm">$1</li>',
  );

  // Line breaks
  html = html.replace(/\n\n/g, '<br class="my-2" />');
  html = html.replace(/\n/g, "<br />");

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function HAMarkdown({ props }: BaseComponentProps<HAMarkdownProps>) {
  const { title, content } = props;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">
        {title}
      </h3>
      <div
        className="prose prose-sm text-foreground"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    </div>
  );
}
