import { Anthropic } from '@anthropic-ai/sdk';
import db from '../factory/database';

export class AIRClient {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  private async getCurrentPlan(): Promise<string> {
    const result = await db.query(
      'SELECT plan FROM tenants WHERE id = $1',
      [this.tenantId]
    );
    return result.rows[0]?.plan?.toLowerCase() || 'starter';
  }

  async getModelForAgent(): Promise<string> {
    const plan = await this.getCurrentPlan();

    if (plan === 'enterprise' || plan === 'elite') {
      return 'claude-4-opus-2026-04-01';   // Opus 4.6
    }
    if (plan === 'pro') {
      return 'claude-3-5-sonnet-2026-04-01';
    }
    return 'claude-3-haiku-2026-04-01';
  }

  async sendMessage(messages: any[], options: any = {}) {
    const model = await this.getModelForAgent();

    const anthropic = new Anthropic({ 
      apiKey: process.env.ANTHROPIC_API_KEY! 
    });

    return anthropic.messages.create({
      model,
      messages,
      max_tokens: options.max_tokens || 4096,
      ...options,
    });
  }
}

export default AIRClient;
