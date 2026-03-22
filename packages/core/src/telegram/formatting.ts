export function formatMessage(text: string): string { return text }
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~\`>#+\-=|{}.!]/g, "\\$&")
}
export function parseEntities(_text: string): unknown[] { return [] }


export function markdownToTelegramHtml(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/~~(.*?)~~/g, '<s>$1</s>')
    .replace(/__(.*?)__/g, '<u>$1</u>')
}
