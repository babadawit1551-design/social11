import type { FastifyInstance } from 'fastify';
import { PrismaClient } from 'smas-shared';
import { PLATFORM_CHAR_LIMITS } from 'smas-shared';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { HumanMessage } from '@langchain/core/messages';
import { config } from '../config';
import { requireRole } from '../middleware/auth';

type Platform = 'twitter' | 'linkedin' | 'facebook' | 'instagram';
type Model = 'gpt-4' | 'claude' | 'llama';

interface GenerateBody {
  topic: string;
  platform: Platform;
  model: Model;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    (setTimeout as any)(() => reject(new Error('timeout')), ms);
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function aiRoutes(app: FastifyInstance | any, prisma: PrismaClient) {
  app.post(
    '/ai/generate',
    { preHandler: requireRole('admin', 'editor') },
    async (
      request: { user: { id: string }; body: GenerateBody },
      reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      const { topic, platform, model } = request.body as GenerateBody;
      const userId = request.user.id;

      const limit = PLATFORM_CHAR_LIMITS[platform];
      const prompt = `Write a social media post for ${platform} about: ${topic}. Keep it under ${limit} characters. Return only the post text, no hashtags unless natural.`;

      let llm: ChatOpenAI | ChatAnthropic | ChatOllama;

      if (model === 'gpt-4') {
        llm = new ChatOpenAI({
          modelName: 'gpt-4',
          openAIApiKey: config.OPENAI_API_KEY,
          timeout: 10000,
        });
      } else if (model === 'claude') {
        llm = new ChatAnthropic({
          model: 'claude-3-5-sonnet-20241022',
          anthropicApiKey: config.ANTHROPIC_API_KEY,
          timeout: 10000,
        });
      } else {
        // llama via Ollama — timeout handled by outer Promise.race
        llm = new ChatOllama({
          model: 'llama3',
          baseUrl: config.OLLAMA_BASE_URL,
        });
      }

      let generatedText: string;
      try {
        const response = await Promise.race([
          llm.invoke([new HumanMessage(prompt)]),
          timeoutPromise(10000),
        ]);
        generatedText =
          typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);
      } catch {
        return reply.status(503).send({ error: 'ai_backend_unavailable', backend: model });
      }

      // Truncate to platform character limit if needed
      if (generatedText.length > limit) {
        generatedText = generatedText.slice(0, limit);
      }

      const post = await prisma.post.create({
        data: {
          body: generatedText,
          originalAiBody: generatedText,
          createdBy: userId,
          targetPlatforms: [platform],
          status: 'draft',
        },
      });

      return reply.status(201).send({
        postId: post.id,
        body: post.body,
        platform,
        model,
      });
    },
  );
}
