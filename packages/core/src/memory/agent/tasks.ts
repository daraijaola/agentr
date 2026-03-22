export interface AgentTask { id: string; tenantId: string; task: string; scheduledAt: Date }
export async function createTask(_tenantId: string, _task: unknown): Promise<void> {}
export async function getTasks(_tenantId: string): Promise<AgentTask[]> { return [] }
export async function deleteTask(_tenantId: string, _taskId: string): Promise<void> {}

export interface TaskStore {
  getDependents(taskId: string): string[]
  create(tenantId: string, task: unknown): Promise<string>
  list(tenantId: string): Promise<AgentTask[]>
  delete(tenantId: string, taskId: string): Promise<void>
}

export function getTaskStore(_db: unknown): TaskStore {
  return {
    getDependents(_taskId: string): string[] { return [] },
    async create(_tenantId: string, _task: unknown): Promise<string> { return '' },
    async list(_tenantId: string): Promise<AgentTask[]> { return [] },
    async delete(_tenantId: string, _taskId: string): Promise<void> {},
  }
}
