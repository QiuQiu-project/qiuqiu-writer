export function countCharacters(html: string): number {
  if (!html) return 0;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const text = tempDiv.textContent || tempDiv.innerText || '';
  return text.length;
}

export function convertTextToHtml(text: string): string {
  if (!text || text.trim() === '') {
    return '<p></p>';
  }
  
  const htmlTagPattern = /<\/?[a-z][\s\S]*>/i;
  const hasHtmlTags = htmlTagPattern.test(text);
  
  if (hasHtmlTags) {
    const trimmed = text.trim();
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      return text;
    }
    if (trimmed.includes('<p>') || trimmed.includes('<br>') || trimmed.includes('<div>')) {
      return text;
    }
  }
  
  return text
    .split(/\n\s*\n/)
    .map(para => para.trim())
    .filter(para => para.length > 0)
    .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('') || '<p></p>';
}