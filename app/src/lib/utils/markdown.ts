import { marked } from 'marked';

// Configure marked for clean output
marked.setOptions({
  gfm: true,
  breaks: false,
});

export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  // Use marked for proper markdown parsing
  const html = marked.parse(markdown, { async: false }) as string;
  return html;
}

// Extract specific sections from markdown
export function extractSection(markdown: string, sectionName: string): string | null {
  const regex = new RegExp(`^## ${sectionName}\\n([\\s\\S]*?)(?=^## |$)`, 'gm');
  const match = regex.exec(markdown);
  return match ? match[1].trim() : null;
}

// Split markdown into resume and cover letter sections
export function splitPackage(markdown: string): { resume: string; coverLetter: string } {
  const coverLetterMarker = '## WAR Cover Letter';
  const coverLetterIndex = markdown.indexOf(coverLetterMarker);

  if (coverLetterIndex === -1) {
    return { resume: markdown, coverLetter: '' };
  }

  return {
    resume: markdown.slice(0, coverLetterIndex).trim(),
    coverLetter: markdown.slice(coverLetterIndex).trim(),
  };
}
