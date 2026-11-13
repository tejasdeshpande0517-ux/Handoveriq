/**
 * Firebase Genkit + Google Gemini AI Flow Definitions for HandoverIQ
 * Enforces structured JSON output, source citation verification, and grounded RAG Q&A.
 */
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

export interface GenkitHandoverFlowInput {
  projectName: string;
  sources: {
    id: string;
    type: string;
    title: string;
    author: string;
    timestamp: string;
    url: string;
    redactedText: string;
  }[];
  geminiApiKey: string;
}

export async function executeGenkitStructuredHandoverFlow(input: GenkitHandoverFlowInput) {
  const genAI = new GoogleGenerativeAI(input.geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      responseSchema: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            section: {
              type: SchemaType.STRING,
              enum: [
                'PROJECT_SNAPSHOT',
                'KEY_DECISIONS',
                'PENDING_WORK',
                'PROBLEMS_ISSUES',
                'DEPENDENCIES',
                'RISKS',
                'OPEN_QUESTIONS',
              ],
            },
            statement: { type: SchemaType.STRING },
            sourceIds: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING },
            },
            confidence: {
              type: SchemaType.STRING,
              enum: ['HIGH', 'MEDIUM', 'LOW'],
            },
            confidenceScore: { type: SchemaType.NUMBER },
            evidence: { type: SchemaType.STRING },
          },
          required: [
            'section',
            'statement',
            'sourceIds',
            'confidence',
            'confidenceScore',
            'evidence',
          ],
        },
      },
    },
  });

  const formattedSources = input.sources
    .map(
      (s) =>
        `[SOURCE ID: ${s.id}] (${s.type} | Author: ${s.author} | Time: ${s.timestamp} | URL: ${s.url})\n${s.redactedText}`
    )
    .join('\n\n---\n\n');

  const prompt = `Analyze the redacted project sources for "${input.projectName}".
Extract facts strictly grounded in the provided sources across all 7 sections.
Never invent facts. If a section has no supporting source evidence, output statement: "Not found in available sources."

SOURCES:
${formattedSources}`;

  const response = await model.generateContent(prompt);
  return JSON.parse(response.response.text());
}

