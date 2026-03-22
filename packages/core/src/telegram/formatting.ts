export function formatMessage(text: string): string { return text }
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~\`>#+\-=|{}.!]/g, "\\$&")
}
export function parseEntities(_text: string): unknown[] { return [] }
