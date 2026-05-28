import type { FastifyInstance } from 'fastify';

export interface AppModule {
  name: string;
  register: (app: FastifyInstance) => Promise<void>;
}
