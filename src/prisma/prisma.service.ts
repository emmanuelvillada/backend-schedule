import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const url = process.env.DATABASE_URL ?? '';
    const urlWithSsl = url.includes('sslmode')
      ? url
      : url + (url.includes('?') ? '&' : '?') + 'sslmode=require';

    super({
      datasources: { db: { url: urlWithSsl } },
      log: ['error'],
    });

    // Prisma 6: el engine de Rust lee overrideDatasources, no datasources del constructor
    (this as any)._engineConfig = {
      ...(this as any)._engineConfig,
      overrideDatasources: { db: { url: urlWithSsl } },
    };
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
