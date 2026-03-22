export interface AgentTask { id: string; tenantId: string; task: string; scheduledAt: Date }
export async function createTask(_tenantId: string, _task: unknown): Promise<void> {}
export async function getTasks(_tenantId: string): Promise<AgentTask[]> { return [] }
export async function deleteTask(_tenantId: string, _taskId: string): Promise<void> {}
